"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { feedComment, feedPost, follow, repost, savedItem, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { getLikedSet, setLike } from "@/lib/likes"
import { notifyUser } from "@/app/actions/notifications"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

export type PostMedia = { type: "image" | "video"; url: string }

/**
 * Normalizes a feed_post row's media into an ordered carousel array. New posts
 * store the `media` jsonb array; legacy posts only have `image`/`video`, so we
 * synthesize a single-item array from those for a uniform client contract.
 */
function toMedia(p: { media: PostMedia[] | null; image: string | null; video: string | null }): PostMedia[] {
  if (Array.isArray(p.media) && p.media.length > 0) return p.media
  if (p.image) return [{ type: "image", url: p.image }]
  if (p.video) return [{ type: "video", url: p.video }]
  return []
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
  liked: boolean
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
  createdAtMs: number
  text: string
  image: string | null
  video: string | null
  media: PostMedia[]
  likes: number
  liked: boolean
  reposts: number
  reposted: boolean
  saved: boolean
  edited: boolean
  isFollowing: boolean
  isSelf: boolean
  comments: FeedCommentView[]
}

/** Returns the set of postIds the given user has reposted (empty if signed out). */
async function getRepostedSet(userId: string | null): Promise<Set<number>> {
  if (!userId) return new Set()
  const rows = await db.select({ postId: repost.postId }).from(repost).where(eq(repost.userId, userId))
  return new Set(rows.map((r) => r.postId))
}

/** Returns the set of post itemKeys the given user has bookmarked (saved). */
async function getSavedPostSet(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set()
  const rows = await db
    .select({ key: savedItem.itemKey })
    .from(savedItem)
    .where(and(eq(savedItem.userId, userId), eq(savedItem.itemType, "post")))
  return new Set(rows.map((r) => r.key))
}

// Maps a feed_comment row to the client view. `currentUserId` decides `isSelf`.
function toCommentView(
  c: typeof feedComment.$inferSelect,
  infoMap: Map<string, { name: string; image: string | null }>,
  currentUserId: string | null,
  likedCommentSet: Set<number>,
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
    liked: likedCommentSet.has(c.id),
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
  const repostedSet = await getRepostedSet(currentUserId)
  const savedSet = await getSavedPostSet(currentUserId)
  const likedPostSet = await getLikedSet(currentUserId, "post", posts.map((p) => p.id))
  const likedCommentSet = await getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id))

  const infoMap = await getUserInfoMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  // Posts are returned newest-first. The client decides presentation per tab:
  // "For you" gets a per-session shuffle (fresh on every load/reopen, stable
  // while open) and "Following" stays strictly newest-first. Keeping the server
  // order deterministic is what lets the client shuffle reproducibly.
  const ordered = [...posts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return ordered.map((p) => ({
    id: p.id,
    authorId: p.userId,
    user: infoMap.get(p.userId)?.name ?? p.authorName,
    handle: getHandle(infoMap.get(p.userId)?.name ?? p.authorName),
    initials: getInitials(infoMap.get(p.userId)?.name ?? p.authorName),
    color: getAvatarColor(p.userId),
    authorImage: infoMap.get(p.userId)?.image ?? null,
    postedAt: timeAgo(p.createdAt),
    createdAtMs: p.createdAt.getTime(),
    text: p.text,
    image: p.image,
    video: p.video,
    media: toMedia(p),
    likes: p.likes,
    liked: likedPostSet.has(p.id),
    reposts: p.reposts,
    reposted: repostedSet.has(p.id),
    saved: savedSet.has(String(p.id)),
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    comments: comments
      .filter((c) => c.postId === p.id)
      .map((c) => toCommentView(c, infoMap, currentUserId, likedCommentSet)),
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
  const repostedSet = await getRepostedSet(currentUserId)
  const savedSet = await getSavedPostSet(currentUserId)
  const likedPostSet = await getLikedSet(currentUserId, "post", posts.map((p) => p.id))
  const likedCommentSet = await getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id))

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
    createdAtMs: p.createdAt.getTime(),
    text: p.text,
    image: p.image,
    video: p.video,
    media: toMedia(p),
    likes: p.likes,
    liked: likedPostSet.has(p.id),
    reposts: p.reposts,
    reposted: repostedSet.has(p.id),
    saved: savedSet.has(String(p.id)),
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    comments: comments
      .filter((c) => c.postId === p.id)
      .map((c) => toCommentView(c, infoMap, currentUserId, likedCommentSet)),
  }))
}

/**
 * Posts the given user has reposted, newest-repost-first. Powers the profile
 * "Reposts" tab. Each returned post carries its original author identity.
 */
export async function getRepostsByUser(userId: string): Promise<FeedPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  const repostRows = await db
    .select({ postId: repost.postId, createdAt: repost.createdAt })
    .from(repost)
    .where(eq(repost.userId, userId))
    .orderBy(desc(repost.createdAt))
  if (repostRows.length === 0) return []

  const orderById = new Map(repostRows.map((r, i) => [r.postId, i]))
  const postIds = repostRows.map((r) => r.postId)

  const posts = await db.select().from(feedPost).where(inArray(feedPost.id, postIds))
  const comments = await db.select().from(feedComment).orderBy(asc(feedComment.createdAt))
  const repostedSet = await getRepostedSet(currentUserId)
  const savedSet = await getSavedPostSet(currentUserId)
  const likedPostSet = await getLikedSet(currentUserId, "post", posts.map((p) => p.id))
  const likedCommentSet = await getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id))

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

  const infoMap = await getUserInfoMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  // Preserve repost recency order (the query above doesn't guarantee it).
  const ordered = [...posts].sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0))

  return ordered.map((p) => ({
    id: p.id,
    authorId: p.userId,
    user: infoMap.get(p.userId)?.name ?? p.authorName,
    handle: getHandle(infoMap.get(p.userId)?.name ?? p.authorName),
    initials: getInitials(infoMap.get(p.userId)?.name ?? p.authorName),
    color: getAvatarColor(p.userId),
    authorImage: infoMap.get(p.userId)?.image ?? null,
    postedAt: timeAgo(p.createdAt),
    createdAtMs: p.createdAt.getTime(),
    text: p.text,
    image: p.image,
    video: p.video,
    media: toMedia(p),
    likes: p.likes,
    liked: likedPostSet.has(p.id),
    reposts: p.reposts,
    reposted: repostedSet.has(p.id),
    saved: savedSet.has(String(p.id)),
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    comments: comments
      .filter((c) => c.postId === p.id)
      .map((c) => toCommentView(c, infoMap, currentUserId, likedCommentSet)),
  }))
}

/**
 * Toggles a repost of a post by the signed-in user. Persists a repost row and
 * keeps the denormalized feed_post.reposts counter in sync. Returns new state.
 */
export async function toggleRepost(postId: number): Promise<{ reposted: boolean; reposts: number }> {
  const user = await requireUser()
  const [post] = await db
    .select({ reposts: feedPost.reposts, userId: feedPost.userId })
    .from(feedPost)
    .where(eq(feedPost.id, postId))
  if (!post) throw new Error("Post not found.")

  const existing = await db
    .select({ id: repost.id })
    .from(repost)
    .where(and(eq(repost.userId, user.id), eq(repost.postId, postId)))
    .limit(1)

  let reposted: boolean
  let nextCount: number
  if (existing.length > 0) {
    await db.delete(repost).where(eq(repost.id, existing[0].id))
    nextCount = Math.max(0, post.reposts - 1)
    reposted = false
  } else {
    await db.insert(repost).values({ userId: user.id, postId })
    nextCount = post.reposts + 1
    reposted = true
    // Notify the author when someone reposts their post (not on un-repost).
    if (post.userId !== user.id) {
      await notifyUser({
        userId: post.userId,
        actorId: user.id,
        actorName: user.name,
        type: "repost",
        message: `${user.name} reposted your post`,
        link: "/feed",
      })
    }
  }
  await db.update(feedPost).set({ reposts: nextCount }).where(eq(feedPost.id, postId))

  revalidatePath("/feed")
  revalidatePath(`/u/${user.id}`)
  return { reposted, reposts: nextCount }
}

export async function createPost(input: {
  text: string
  image?: string | null
  video?: string | null
  media?: PostMedia[]
}) {
  const user = await requireUser()
  const text = input.text.trim()

  // Accept either the new ordered media array or the legacy single image/video.
  const media: PostMedia[] = (input.media ?? []).filter((m) => m && m.url).slice(0, 10)
  if (media.length === 0) {
    if (input.image) media.push({ type: "image", url: input.image })
    else if (input.video) media.push({ type: "video", url: input.video })
  }
  if (!text && media.length === 0) throw new Error("Post cannot be empty.")

  // Mirror the first item into the legacy columns so older readers still work.
  const first = media[0] ?? null

  const [inserted] = await db
    .insert(feedPost)
    .values({
      userId: user.id,
      authorName: user.name,
      authorHandle: getHandle(user.name),
      text,
      image: first?.type === "image" ? first.url : null,
      video: first?.type === "video" ? first.url : null,
      media: media.length > 0 ? media : null,
    })
    .returning({ id: feedPost.id })

  // Note: new posts intentionally do NOT notify followers. Notifications are
  // reserved for when a followed user goes live (see app/actions/live.ts).
  // Revalidate the author's profile too so the new post shows up immediately —
  // and, since posts are ordered newest-first, as the first tile on the Posts tab.
  revalidatePath("/feed")
  revalidatePath(`/u/${user.id}`)

  // Return the new id so the client can float this post to the top of the feed.
  return { id: inserted?.id ?? null }
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
  const { changed } = await setLike(user.id, "post", input.postId, input.liked)
  if (!changed) return
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

/** Toggle a like on a comment. Idempotent — persists per-user state. */
export async function setCommentLike(input: { commentId: number; liked: boolean }) {
  const user = await requireUser()
  const [row] = await db
    .select({ likes: feedComment.likes })
    .from(feedComment)
    .where(eq(feedComment.id, input.commentId))
  if (!row) return
  const { changed } = await setLike(user.id, "feed_comment", input.commentId, input.liked)
  if (!changed) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(feedComment).set({ likes: next }).where(eq(feedComment.id, input.commentId))
  revalidatePath("/feed")
}

/** Edit one of the signed-in user's own post-tab comments (no time limit). */
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

  await db.update(feedComment).set({ text, editedAt: new Date() }).where(eq(feedComment.id, input.commentId))
  revalidatePath("/feed")
}

/** Delete one of the signed-in user's own post-tab comments and its replies (no time limit). */
export async function deletePostComment(commentId: number) {
  const user = await requireUser()
  const [row] = await db
    .select({ userId: feedComment.userId, createdAt: feedComment.createdAt })
    .from(feedComment)
    .where(eq(feedComment.id, commentId))
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only delete your own comments.")

  await db.delete(feedComment).where(eq(feedComment.parentId, commentId))
  await db.delete(feedComment).where(and(eq(feedComment.id, commentId), eq(feedComment.userId, user.id)))
  revalidatePath("/feed")
}
