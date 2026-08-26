"use server"

import { asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { devotionalComment } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { EDIT_WINDOW_MS } from "@/lib/interactions"
import { getLikeCount, getLikedSet, setLike } from "@/lib/likes"

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
  // Read-only path used during page render: on any DB failure return an empty
  // comment list rather than throwing, so a transient outage doesn't crash the
  // devotional page. (Mutations below still throw so the user sees the error.)
  try {
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
  } catch (err) {
    console.error("[v0] getDevotionalComments query failed:", err)
    return []
  }
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

/**
 * Devotionals are keyed by an opaque string id (e.g. "dev-1781901451302")
 * rather than a numeric row, but the generic like table stores an integer
 * targetId. We derive a stable, positive 31-bit integer from the string via a
 * deterministic hash so both the like count and the user's liked state persist
 * across refreshes.
 */
function devotionalTargetId(devotionalDate: string): number {
  let hash = 0
  for (let i = 0; i < devotionalDate.length; i++) {
    hash = (Math.imul(31, hash) + devotionalDate.charCodeAt(i)) | 0
  }
  return hash & 0x7fffffff
}

/** Like count + whether the current user has liked the given devotional day. */
export async function getDevotionalLikeState(
  devotionalDate: string,
): Promise<{ likes: number; liked: boolean }> {
  const targetId = devotionalTargetId(devotionalDate)
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id ?? null
  const [likes, likedSet] = await Promise.all([
    getLikeCount("devotional", targetId),
    getLikedSet(userId, "devotional", [targetId]),
  ])
  return { likes, liked: likedSet.has(targetId) }
}

/** Toggle the current user's like on a devotional day. Idempotent. */
export async function setDevotionalLike(input: { devotionalDate: string; liked: boolean }) {
  const user = await requireUser()
  await setLike(user.id, "devotional", devotionalTargetId(input.devotionalDate), input.liked)
  revalidatePath("/")
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

/**
 * Delete one of the user's own devotional comments (and replies). Deliberately
 * NOT time-limited — an author can always remove their own words, however old
 * the comment is. Ownership is still enforced; only the expiry is gone.
 */
export async function deleteDevotionalComment(commentId: number) {
  const user = await requireUser()
  const [row] = await db
    .select({ userId: devotionalComment.userId })
    .from(devotionalComment)
    .where(eq(devotionalComment.id, commentId))
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only delete your own comments.")
  await db.delete(devotionalComment).where(eq(devotionalComment.parentId, commentId))
  await db.delete(devotionalComment).where(eq(devotionalComment.id, commentId))
  revalidatePath("/devotional")
}
