"use server"

import { asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { devotionalComment } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { EDIT_WINDOW_MS, DELETE_WINDOW_MS } from "@/lib/interactions"
import { getLikedSet, setLike } from "@/lib/likes"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to comment.")
  return session.user
}

export type DevotionalCommentView = {
  id: number
  parentId: number | null
  authorId: string
  isSelf: boolean
  user: string
  handle: string
  initials: string
  color: string
  text: string
  likes: number
  liked: boolean
  edited: boolean
  postedAt: string
  createdAtMs: number
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "Just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export async function getDevotionalComments(devotionalDate: string): Promise<DevotionalCommentView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const rows = await db
    .select()
    .from(devotionalComment)
    .where(eq(devotionalComment.devotionalDate, devotionalDate))
    .orderBy(asc(devotionalComment.createdAt))

  const likedSet = await getLikedSet(viewerId, "devotional_comment", rows.map((r) => r.id))

  return rows.map((c) => ({
    id: c.id,
    parentId: c.parentId ?? null,
    authorId: c.userId,
    isSelf: viewerId === c.userId,
    user: c.authorName,
    handle: getHandle(c.authorName),
    initials: getInitials(c.authorName),
    color: getAvatarColor(c.userId),
    text: c.text,
    likes: c.likes,
    liked: likedSet.has(c.id),
    edited: !!c.editedAt,
    postedAt: timeAgo(c.createdAt),
    createdAtMs: c.createdAt.getTime(),
  }))
}

export async function addDevotionalComment(input: { devotionalDate: string; text: string; parentId?: number | null }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text) throw new Error("Comment cannot be empty.")

  await db.insert(devotionalComment).values({
    devotionalDate: input.devotionalDate,
    parentId: input.parentId ?? null,
    userId: user.id,
    authorName: user.name,
    text,
  })
  revalidatePath("/devotional")
}

/** Toggle a like on a devotional comment. Idempotent — persists per-user state. */
export async function setDevotionalCommentLike(input: { commentId: number; liked: boolean }) {
  const user = await requireUser()
  const [row] = await db
    .select({ likes: devotionalComment.likes })
    .from(devotionalComment)
    .where(eq(devotionalComment.id, input.commentId))
  if (!row) return
  const { changed } = await setLike(user.id, "devotional_comment", input.commentId, input.liked)
  if (!changed) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(devotionalComment).set({ likes: next }).where(eq(devotionalComment.id, input.commentId))
  revalidatePath("/devotional")
}

/** Edit one of the user's own devotional comments, within the edit window. */
export async function editDevotionalComment(input: { commentId: number; text: string }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text) throw new Error("Comment cannot be empty.")
  const [row] = await db
    .select({ userId: devotionalComment.userId, createdAt: devotionalComment.createdAt })
    .from(devotionalComment)
    .where(eq(devotionalComment.id, input.commentId))
  if (!row) throw new Error("Comment not found.")
  if (row.userId !== user.id) throw new Error("You can only edit your own comments.")
  if (Date.now() - row.createdAt.getTime() > EDIT_WINDOW_MS) throw new Error("This comment can no longer be edited.")
  await db.update(devotionalComment).set({ text, editedAt: new Date() }).where(eq(devotionalComment.id, input.commentId))
  revalidatePath("/devotional")
}

/** Delete one of the user's own devotional comments (and replies), within the delete window. */
export async function deleteDevotionalComment(commentId: number) {
  const user = await requireUser()
  const [row] = await db
    .select({ userId: devotionalComment.userId, createdAt: devotionalComment.createdAt })
    .from(devotionalComment)
    .where(eq(devotionalComment.id, commentId))
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only delete your own comments.")
  if (Date.now() - row.createdAt.getTime() > DELETE_WINDOW_MS) throw new Error("This comment can no longer be deleted.")
  await db.delete(devotionalComment).where(eq(devotionalComment.parentId, commentId))
  await db.delete(devotionalComment).where(eq(devotionalComment.id, commentId))
  revalidatePath("/devotional")
}
