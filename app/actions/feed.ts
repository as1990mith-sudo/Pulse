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
  user: string
  handle: string
  initials: string
  color: string
  authorImage: string | null
  text: string
  postedAt: string
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
  isFollowing: boolean
  isSelf: boolean
  comments: FeedCommentView[]
}

/** Builds a map of userId -> profile image for the given user ids. */
async function getUserImageMap(userIds: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({ id: userTable.id, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, unique))
  return new Map(rows.map((r) => [r.id, r.image]))
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

  const imageMap = await getUserImageMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  // Surface posts from people the user follows (and their own) ahead of
  // everyone else, while preserving most-recent-first order within each band.
  const ordered = [...posts].sort((a, b) => {
    const aPriority = currentUserId === a.userId || followingIds.has(a.userId) ? 0 : 1
    const bPriority = currentUserId === b.userId || followingIds.has(b.userId) ? 0 : 1
    if (aPriority !== bPriority) return aPriority - bPriority
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  return ordered.map((p) => ({
    id: p.id,
    authorId: p.userId,
    user: p.authorName,
    handle: p.authorHandle,
    initials: getInitials(p.authorName),
    color: getAvatarColor(p.userId),
    authorImage: imageMap.get(p.userId) ?? null,
    postedAt: timeAgo(p.createdAt),
    text: p.text,
    image: p.image,
    video: p.video,
    likes: p.likes,
    reposts: p.reposts,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    comments: comments
      .filter((c) => c.postId === p.id)
      .map((c) => ({
        id: c.id,
        user: c.authorName,
        handle: c.authorHandle,
        initials: getInitials(c.authorName),
        color: getAvatarColor(c.userId),
        authorImage: imageMap.get(c.userId) ?? null,
        text: c.text,
        postedAt: timeAgo(c.createdAt),
      })),
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

  const imageMap = await getUserImageMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  return posts.map((p) => ({
    id: p.id,
    authorId: p.userId,
    user: p.authorName,
    handle: p.authorHandle,
    initials: getInitials(p.authorName),
    color: getAvatarColor(p.userId),
    authorImage: imageMap.get(p.userId) ?? null,
    postedAt: timeAgo(p.createdAt),
    text: p.text,
    image: p.image,
    video: p.video,
    likes: p.likes,
    reposts: p.reposts,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    comments: comments
      .filter((c) => c.postId === p.id)
      .map((c) => ({
        id: c.id,
        user: c.authorName,
        handle: c.authorHandle,
        initials: getInitials(c.authorName),
        color: getAvatarColor(c.userId),
        authorImage: imageMap.get(c.userId) ?? null,
        text: c.text,
        postedAt: timeAgo(c.createdAt),
      })),
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

export async function addPostComment(input: { postId: number; text: string }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text) throw new Error("Comment cannot be empty.")

  await db.insert(feedComment).values({
    postId: input.postId,
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
