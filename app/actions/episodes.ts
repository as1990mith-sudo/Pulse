"use server"

import { asc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { episode, episodeComment, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { EDIT_WINDOW_MS, DELETE_WINDOW_MS } from "@/lib/interactions"
import { notifyUser } from "@/app/actions/notifications"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

export type EpisodeCommentView = {
  id: number
  parentId: number | null
  authorId: string
  isSelf: boolean
  user: string
  handle: string
  initials: string
  color: string
  authorImage: string | null
  text: string
  likes: number
  edited: boolean
  postedAt: string
  createdAtMs: number
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

/** Comments for a published episode, oldest first. */
export async function getEpisodeComments(episodeId: number): Promise<EpisodeCommentView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const rows = await db
    .select()
    .from(episodeComment)
    .where(eq(episodeComment.episodeId, episodeId))
    .orderBy(asc(episodeComment.createdAt))

  const ids = [...new Set(rows.map((r) => r.userId))]
  const imageMap = new Map<string, string | null>()
  if (ids.length > 0) {
    const imgs = await db
      .select({ id: userTable.id, image: userTable.image })
      .from(userTable)
      .where(inArray(userTable.id, ids))
    for (const u of imgs) imageMap.set(u.id, u.image)
  }

  return rows.map((c) => ({
    id: c.id,
    parentId: c.parentId ?? null,
    authorId: c.userId,
    isSelf: viewerId === c.userId,
    user: c.authorName,
    handle: c.authorHandle,
    initials: getInitials(c.authorName),
    color: getAvatarColor(c.userId),
    authorImage: imageMap.get(c.userId) ?? null,
    text: c.text,
    likes: c.likes,
    edited: !!c.editedAt,
    postedAt: timeAgo(c.createdAt),
    createdAtMs: c.createdAt.getTime(),
  }))
}

/** Toggles a like on an episode (counter-based, matching feed posts). */
export async function setEpisodeLike(input: { episodeId: number; liked: boolean }) {
  const user = await requireUser()
  const [row] = await db
    .select({ likes: episode.likes, hostUserId: episode.hostUserId, slug: episode.slug })
    .from(episode)
    .where(eq(episode.id, input.episodeId))
  if (!row) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(episode).set({ likes: next }).where(eq(episode.id, input.episodeId))

  if (input.liked && row.hostUserId && row.hostUserId !== user.id) {
    await notifyUser({
      userId: row.hostUserId,
      actorId: user.id,
      actorName: user.name,
      type: "like",
      message: "liked your episode",
      link: `/live/${row.slug}`,
    })
  }
  revalidatePath(`/live/${row.slug}`)
}

/** Adds a comment to an episode and notifies the host. */
export async function addEpisodeComment(input: { episodeId: number; text: string; parentId?: number | null }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text) throw new Error("Comment cannot be empty.")

  await db.insert(episodeComment).values({
    episodeId: input.episodeId,
    parentId: input.parentId ?? null,
    userId: user.id,
    authorName: user.name,
    authorHandle: getHandle(user.name),
    text,
  })

  const [row] = await db
    .select({ hostUserId: episode.hostUserId, slug: episode.slug })
    .from(episode)
    .where(eq(episode.id, input.episodeId))
  if (row?.hostUserId && row.hostUserId !== user.id) {
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text
    await notifyUser({
      userId: row.hostUserId,
      actorId: user.id,
      actorName: user.name,
      type: "comment",
      message: preview,
      link: `/live/${row.slug}`,
    })
  }
  if (row) revalidatePath(`/live/${row.slug}`)
}

/** Likes an episode comment (counter-based). */
export async function setEpisodeCommentLike(input: { commentId: number; liked: boolean }) {
  await requireUser()
  const [row] = await db
    .select({ likes: episodeComment.likes })
    .from(episodeComment)
    .where(eq(episodeComment.id, input.commentId))
  if (!row) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(episodeComment).set({ likes: next }).where(eq(episodeComment.id, input.commentId))
}

/** Edit one of the signed-in user's own episode comments, within the edit window. */
export async function editEpisodeComment(input: { commentId: number; text: string }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text) throw new Error("Comment cannot be empty.")
  const [row] = await db
    .select({ userId: episodeComment.userId, createdAt: episodeComment.createdAt, episodeId: episodeComment.episodeId })
    .from(episodeComment)
    .where(eq(episodeComment.id, input.commentId))
  if (!row) throw new Error("Comment not found.")
  if (row.userId !== user.id) throw new Error("You can only edit your own comments.")
  if (Date.now() - row.createdAt.getTime() > EDIT_WINDOW_MS) throw new Error("This comment can no longer be edited.")
  await db.update(episodeComment).set({ text, editedAt: new Date() }).where(eq(episodeComment.id, input.commentId))
  const [ep] = await db.select({ slug: episode.slug }).from(episode).where(eq(episode.id, row.episodeId))
  if (ep) revalidatePath(`/live/${ep.slug}`)
}

/** Delete one of the signed-in user's own episode comments (and replies), within the delete window. */
export async function deleteEpisodeComment(commentId: number) {
  const user = await requireUser()
  const [row] = await db
    .select({ userId: episodeComment.userId, createdAt: episodeComment.createdAt, episodeId: episodeComment.episodeId })
    .from(episodeComment)
    .where(eq(episodeComment.id, commentId))
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only delete your own comments.")
  if (Date.now() - row.createdAt.getTime() > DELETE_WINDOW_MS) throw new Error("This comment can no longer be deleted.")
  await db.delete(episodeComment).where(eq(episodeComment.parentId, commentId))
  await db.delete(episodeComment).where(eq(episodeComment.id, commentId))
  const [ep] = await db.select({ slug: episode.slug }).from(episode).where(eq(episode.id, row.episodeId))
  if (ep) revalidatePath(`/live/${ep.slug}`)
}
