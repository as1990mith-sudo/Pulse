"use server"

import { asc, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { feedComment, feedPost } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"

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
  text: string
  postedAt: string
}

export type FeedPostView = {
  id: number
  user: string
  handle: string
  initials: string
  color: string
  postedAt: string
  text: string
  image: string | null
  likes: number
  reposts: number
  comments: FeedCommentView[]
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
  const posts = await db.select().from(feedPost).orderBy(desc(feedPost.createdAt))
  const comments = await db.select().from(feedComment).orderBy(asc(feedComment.createdAt))

  return posts.map((p) => ({
    id: p.id,
    user: p.authorName,
    handle: p.authorHandle,
    initials: getInitials(p.authorName),
    color: getAvatarColor(p.userId),
    postedAt: timeAgo(p.createdAt),
    text: p.text,
    image: p.image,
    likes: p.likes,
    reposts: p.reposts,
    comments: comments
      .filter((c) => c.postId === p.id)
      .map((c) => ({
        id: c.id,
        user: c.authorName,
        handle: c.authorHandle,
        initials: getInitials(c.authorName),
        color: getAvatarColor(c.userId),
        text: c.text,
        postedAt: timeAgo(c.createdAt),
      })),
  }))
}

export async function createPost(input: { text: string; image?: string | null }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text && !input.image) throw new Error("Post cannot be empty.")

  await db.insert(feedPost).values({
    userId: user.id,
    authorName: user.name,
    authorHandle: getHandle(user.name),
    text,
    image: input.image ?? null,
  })
  revalidatePath("/feed")
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
  revalidatePath("/feed")
}

export async function setPostLike(input: { postId: number; liked: boolean }) {
  await requireUser()
  const [row] = await db.select({ likes: feedPost.likes }).from(feedPost).where(eq(feedPost.id, input.postId))
  if (!row) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(feedPost).set({ likes: next }).where(eq(feedPost.id, input.postId))
  revalidatePath("/feed")
}
