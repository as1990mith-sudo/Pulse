"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { feedComment, feedPost, follow, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { notifyUser } from "@/app/actions/notifications"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

export type FeedCommentView = {
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

export type FeedPostView = {
  id: number
  authorId: string
  user: string
  handle: string
  initials: string
  color: string
  authorImage: string | null
  postedAt: string
  text: string
  image: string | null
  video: string | null
  likes: number
  reposts: number
  edited: boolean
  isFollowing: boolean
  isSelf: boolean
  comments: FeedCommentView[]
}

// Maps a feed_comment row to the client view. `currentUserId` decides `isSelf`.
function toCommentView(
  c: typeof feedComment.$inferSelect,
  infoMap: Map<string, { name: string; image: string | null }>,
  currentUserId: string | null,
): FeedCommentView {
  const name = infoMap.get(c.userId)?.name ?? c.authorName
  return {
    id: c.id,
    parentId: c.parentId ?? null,
    authorId: c.userId,
    isSelf: currentUserId === c.userId,
    user: name,
    handle: getHandle(name),
    initials: getInitials(name),
    color: getAvatarColor(c.userId),
    authorImage: infoMap.get(c.userId)?.image ?? null,
    text: c.text,
    likes: c.likes,
    edited: !!c.editedAt,
    postedAt: timeAgo(c.createdAt),
    createdAtMs: c.createdAt.getTime(),
  }
}

/**
 * Builds a map of userId -> live profile info (current name + image) for the
 * given user ids. Posts/comments store a denormalized name at creation time,
 * but we resolve the *current* name here so renaming a user retroactively
 * updates the author name shown on all of their past posts and comments.
 */
async function getUserInfoMap(userIds: string[]): Promise<Map<string, { name: string; image: string | null }>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, unique))
  return new Map(rows.map((r) => [r.id, { name: r.name, image: r.image }]))
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

/** Small seeded PRNG so a shuffle stays stable within a time window. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Posts come in newest-first (banded into discovery vs. followed/own). Most of
 * the time we keep that chronological order, but on some time windows we apply
 * a seeded shuffle *within each band* for variety. The seed rotates every ~2
 * minutes and is per-viewer, so the order is stable across the SWR polls in a
 * given window instead of jumping on every refresh.
 */
function maybeShuffleFeed<T extends { userId: string; createdAt: Date }>(
  posts: T[],
  followingIds: Set<string>,
  currentUserId: string | null,
): void {
  const windowBucket = Math.floor(Date.now() / 120_000) // changes every 2 minutes
  // Only shuffle on roughly 1 of every 3 windows — "sometimes a shuffle".
  if (windowBucket % 3 !== 0) return

  const seedBase = windowBucket ^ hashString(currentUserId ?? "anon")
  const isDiscovery = (p: T) => currentUserId !== p.userId && !followingIds.has(p.userId)

  shuffleRange(posts, (p) => isDiscovery(p), mulberry32(seedBase))
  shuffleRange(posts, (p) => !isDiscovery(p), mulberry32(seedBase + 1))
}

/** In-place Fisher–Yates shuffle restricted to indices matching `inBand`. */
function shuffleRange<T>(arr: T[], inBand: (item: T) => boolean, rand: () => number): void {
  const indices = arr.map((item, i) => (inBand(item) ? i : -1)).filter((i) => i >= 0)
  for (let k = indices.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1))
    const a = indices[k]
    const b = indices[j]
    ;[arr[a], arr[b]] = [arr[b], arr[a]]
  }
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}

export async function getFeed(): Promise<FeedPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  const followingIds = currentUserId
    ? new Set(
        (
          await db
            .select({ followingId: follow.followingId })
            .from(follow)
            .where(eq(follow.followerId, currentUserId))
        ).map((r) => r.followingId),
      )
    : new Set<string>()

  const posts = await db.select().from(feedPost).orderBy(desc(feedPost.createdAt))
  const comments = await db.select().from(feedComment).orderBy(asc(feedComment.createdAt))

  const infoMap = await getUserInfoMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  // "For you" is a discovery feed: surface posts from people the viewer does
  // NOT follow ahead of their own/followed posts (those live in the Following
  // tab). Within each band posts are newest-first, with an occasional shuffle
  // for variety so the feed doesn't feel static between visits.
  const ordered = [...posts].sort((a, b) => {
    const aDiscovery = currentUserId !== a.userId && !followingIds.has(a.userId) ? 0 : 1
    const bDiscovery = currentUserId !== b.userId && !followingIds.has(b.userId) ? 0 : 1
    if (aDiscovery !== bDiscovery) return aDiscovery - bDiscovery
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  maybeShuffleFeed(ordered, followingIds, currentUserId)

  return ordered.map((p) => ({
    id: p.id,
    authorId: p.userId,
    user: infoMap.get(p.userId)?.name ?? p.authorName,
    handle: getHandle(infoMap.get(p.userId)?.name ?? p.authorName),
    initials: getInitials(infoMap.get(p.userId)?.name ?? p.authorName),
    color: getAvatarColor(p.userId),
    authorImage: infoMap.get(p.userId)?.image ?? null,
    postedAt: timeAgo(p.createdAt),
    text: p.text,
    image: p.image,
    video: p.video,
    likes: p.likes,
    reposts: p.reposts,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    comments: comments.filter((c) => c.postId === p.id).map((c) => toCommentView(c, infoMap, currentUserId)),
  }))
}

export async function getPostsByUser(userId: string): Promise<FeedPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  const followingIds = currentUserId
    ? new Set(
        (
          await db
            .select({ followingId: follow.followingId })
            .from(follow)
            .where(eq(follow.followerId, currentUserId))
        ).map((r) => r.followingId),
      )
    : new Set<string>()

  const posts = await db
    .select()
    .from(feedPost)
    .where(eq(feedPost.userId, userId))
    .orderBy(desc(feedPost.createdAt))
  const comments = await db.select().from(feedComment).orderBy(asc(feedComment.createdAt))

  const infoMap = await getUserInfoMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  return posts.map((p) => ({
    id: p.id,
    authorId: p.userId,
    user: infoMap.get(p.userId)?.name ?? p.authorName,
    handle: getHandle(infoMap.get(p.userId)?.name ?? p.authorName),
    initials: getInitials(infoMap.get(p.userId)?.name ?? p.authorName),
    color: getAvatarColor(p.userId),
    authorImage: infoMap.get(p.userId)?.image ?? null,
    postedAt: timeAgo(p.createdAt),
    text: p.text,
    image: p.image,
    video: p.video,
    likes: p.likes,
    reposts: p.reposts,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    comments: comments.filter((c) => c.postId === p.id).map((c) => toCommentView(c, infoMap, currentUserId)),
  }))
}

export async function createPost(input: { text: string; image?: string | null; video?: string | null }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text && !input.image && !input.video) throw new Error("Post cannot be empty.")

  await db.insert(feedPost).values({
    userId: user.id,
    authorName: user.name,
    authorHandle: getHandle(user.name),
    text,
    image: input.image ?? null,
    video: input.video ?? null,
  })

  // Note: new posts intentionally do NOT notify followers. Notifications are
  // reserved for when a followed user goes live (see app/actions/live.ts).
  revalidatePath("/feed")
}

/** Edits the text of one of the signed-in user's own posts (media is unchanged). */
export async function editPost(input: { postId: number; text: string }) {
  const user = await requireUser()
  const [row] = await db
    .select({ userId: feedPost.userId, image: feedPost.image, video: feedPost.video })
    .from(feedPost)
    .where(eq(feedPost.id, input.postId))
  if (!row) throw new Error("Post not found.")
  if (row.userId !== user.id) throw new Error("You can only edit your own posts.")

  const text = input.text.trim()
  // A post must still have content after the edit — keep it non-empty unless
  // there's attached media to carry it.
  if (!text && !row.image && !row.video) throw new Error("Post cannot be empty.")

  await db
    .update(feedPost)
    .set({ text, editedAt: new Date() })
    .where(and(eq(feedPost.id, input.postId), eq(feedPost.userId, user.id)))

  revalidatePath("/feed")
  revalidatePath(`/u/${user.id}`)
}

/** Deletes one of the signed-in user's own posts (and its comments). */
export async function deletePost(postId: number) {
  const user = await requireUser()
  const [row] = await db.select({ userId: feedPost.userId }).from(feedPost).where(eq(feedPost.id, postId))
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only delete your own posts.")

  await db.delete(feedComment).where(eq(feedComment.postId, postId))
  await db.delete(feedPost).where(and(eq(feedPost.id, postId), eq(feedPost.userId, user.id)))

  revalidatePath("/feed")
  revalidatePath(`/u/${user.id}`)
}

export async function addPostComment(input: { postId: number; text: string; parentId?: number | null }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text) throw new Error("Comment cannot be empty.")

  await db.insert(feedComment).values({
    postId: input.postId,
    parentId: input.parentId ?? null,
    userId: user.id,
    authorName: user.name,
    authorHandle: getHandle(user.name),
    text,
  })

  // Notify the post's author that someone engaged with their post.
  const [post] = await db
    .select({ userId: feedPost.userId })
    .from(feedPost)
    .where(eq(feedPost.id, input.postId))
  if (post) {
    await notifyUser({
      userId: post.userId,
      actorId: user.id,
      actorName: user.name,
      type: "comment",
      message: `${user.name} commented on your post`,
      link: "/feed",
    })
  }

  revalidatePath("/feed")
}

export async function setPostLike(input: { postId: number; liked: boolean }) {
  const user = await requireUser()
  const [row] = await db
    .select({ likes: feedPost.likes, userId: feedPost.userId })
    .from(feedPost)
    .where(eq(feedPost.id, input.postId))
  if (!row) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(feedPost).set({ likes: next }).where(eq(feedPost.id, input.postId))

  // Notify the author when their post is liked (not on un-like).
  if (input.liked) {
    await notifyUser({
      userId: row.userId,
      actorId: user.id,
      actorName: user.name,
      type: "like",
      message: `${user.name} liked your post`,
      link: "/feed",
    })
  }

  revalidatePath("/feed")
}

/** Toggle a like on a comment (simple counter, mirrors post likes). */
export async function setCommentLike(input: { commentId: number; liked: boolean }) {
  await requireUser()
  const [row] = await db
    .select({ likes: feedComment.likes })
    .from(feedComment)
    .where(eq(feedComment.id, input.commentId))
  if (!row) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(feedComment).set({ likes: next }).where(eq(feedComment.id, input.commentId))
  revalidatePath("/feed")
}

/** Edit one of the signed-in user's own comments, within the edit window. */
export async function editPostComment(input: { commentId: number; text: string }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text) throw new Error("Comment cannot be empty.")
  const [row] = await db
    .select({ userId: feedComment.userId, createdAt: feedComment.createdAt })
    .from(feedComment)
    .where(eq(feedComment.id, input.commentId))
  if (!row) throw new Error("Comment not found.")
  if (row.userId !== user.id) throw new Error("You can only edit your own comments.")
  if (Date.now() - row.createdAt.getTime() > EDIT_WINDOW_MS) throw new Error("This comment can no longer be edited.")

  await db.update(feedComment).set({ text, editedAt: new Date() }).where(eq(feedComment.id, input.commentId))
  revalidatePath("/feed")
}

/** Delete one of the signed-in user's own comments (and its replies), within the delete window. */
export async function deletePostComment(commentId: number) {
  const user = await requireUser()
  const [row] = await db
    .select({ userId: feedComment.userId, createdAt: feedComment.createdAt })
    .from(feedComment)
    .where(eq(feedComment.id, commentId))
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only delete your own comments.")
  if (Date.now() - row.createdAt.getTime() > DELETE_WINDOW_MS) throw new Error("This comment can no longer be deleted.")

  await db.delete(feedComment).where(eq(feedComment.parentId, commentId))
  await db.delete(feedComment).where(and(eq(feedComment.id, commentId), eq(feedComment.userId, user.id)))
  revalidatePath("/feed")
}
