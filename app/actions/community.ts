"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { communityComment, communityPost, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export type CommunityPostView = {
  id: number
  body: string
  postedAt: string
  commentCount: number
  // True when the signed-in user authored this post. Used to allow self-delete
  // and to reveal the author's own identity to themselves only.
  isSelf: boolean
  // Author identity — ONLY populated for the author's own posts (isSelf). For
  // everyone else these stay null so posts render anonymously to viewers.
  authorName: string | null
  authorHandle: string | null
  authorInitials: string | null
  authorColor: string | null
  authorImage: string | null
}

export type CommunityCommentView = {
  id: number
  userId: string
  userName: string
  handle: string
  initials: string
  color: string
  image: string | null
  body: string
  postedAt: string
  isSelf: boolean
}

/** Newest-first feed of anonymous community posts with reply counts. */
export async function getCommunityPosts(): Promise<CommunityPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const posts = await db
    .select()
    .from(communityPost)
    .where(eq(communityPost.deleted, false))
    .orderBy(desc(communityPost.createdAt))
    .limit(200)

  const ids = posts.map((p) => p.id)
  const countMap = new Map<number, number>()
  if (ids.length) {
    const comments = await db
      .select({ postId: communityComment.postId })
      .from(communityComment)
      .where(and(inArray(communityComment.postId, ids), eq(communityComment.deleted, false)))
    for (const c of comments) countMap.set(c.postId, (countMap.get(c.postId) ?? 0) + 1)
  }

  // The author can see their own posts de-anonymized, so resolve the viewer's
  // current name + avatar once (only needed for their own posts).
  let viewer: { name: string; image: string | null } | null = null
  if (viewerId && posts.some((p) => p.userId === viewerId)) {
    const [row] = await db
      .select({ name: userTable.name, image: userTable.image })
      .from(userTable)
      .where(eq(userTable.id, viewerId))
    if (row) viewer = row
  }

  return posts.map((p) => {
    const isSelf = viewerId === p.userId
    return {
      id: p.id,
      body: p.body,
      postedAt: timeAgo(p.createdAt),
      commentCount: countMap.get(p.id) ?? 0,
      isSelf,
      authorName: isSelf && viewer ? viewer.name : null,
      authorHandle: isSelf && viewer ? getHandle(viewer.name) : null,
      authorInitials: isSelf && viewer ? getInitials(viewer.name) : null,
      authorColor: isSelf ? getAvatarColor(p.userId) : null,
      authorImage: isSelf && viewer ? viewer.image : null,
    }
  })
}

/** Creates an anonymous post in the Community Help room. */
export async function createCommunityPost(body: string): Promise<CommunityPostView> {
  const user = await requireUser()
  const text = body.trim()
  if (!text) throw new Error("Your question can't be empty.")
  if (text.length > 1000) throw new Error("Please keep it under 1000 characters.")

  const [row] = await db
    .insert(communityPost)
    .values({ userId: user.id, body: text })
    .returning()

  revalidatePath("/chatrooms/community")
  return {
    id: row.id,
    body: row.body,
    postedAt: "now",
    commentCount: 0,
    isSelf: true,
    authorName: user.name,
    authorHandle: getHandle(user.name),
    authorInitials: getInitials(user.name),
    authorColor: getAvatarColor(user.id),
    authorImage: user.image ?? null,
  }
}

/** Non-anonymous comments for a post, oldest-first, with commenter profiles. */
export async function getCommunityComments(postId: number): Promise<CommunityCommentView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const rows = await db
    .select()
    .from(communityComment)
    .where(and(eq(communityComment.postId, postId), eq(communityComment.deleted, false)))
    .orderBy(asc(communityComment.createdAt))

  const imageMap = new Map<string, string | null>()
  const userIds = [...new Set(rows.map((r) => r.userId))]
  if (userIds.length) {
    const users = await db
      .select({ id: userTable.id, image: userTable.image })
      .from(userTable)
      .where(inArray(userTable.id, userIds))
    for (const u of users) imageMap.set(u.id, u.image ?? null)
  }

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    handle: getHandle(r.userName),
    initials: getInitials(r.userName),
    color: getAvatarColor(r.userId),
    image: imageMap.get(r.userId) ?? null,
    body: r.body,
    postedAt: timeAgo(r.createdAt),
    isSelf: viewerId === r.userId,
  }))
}

/** Adds a non-anonymous reply to a post. */
export async function addCommunityComment(input: {
  postId: number
  body: string
}): Promise<CommunityCommentView> {
  const user = await requireUser()
  const text = input.body.trim()
  if (!text) throw new Error("Your reply can't be empty.")
  if (text.length > 1000) throw new Error("Please keep it under 1000 characters.")

  const [post] = await db.select().from(communityPost).where(eq(communityPost.id, input.postId))
  if (!post || post.deleted) throw new Error("This post no longer exists.")

  const [row] = await db
    .insert(communityComment)
    .values({ postId: input.postId, userId: user.id, userName: user.name, body: text })
    .returning()

  const [profile] = await db
    .select({ image: userTable.image })
    .from(userTable)
    .where(eq(userTable.id, user.id))

  revalidatePath("/chatrooms/community")
  return {
    id: row.id,
    userId: user.id,
    userName: user.name,
    handle: getHandle(user.name),
    initials: getInitials(user.name),
    color: getAvatarColor(user.id),
    image: profile?.image ?? null,
    body: row.body,
    postedAt: "now",
    isSelf: true,
  }
}

/** Author-only edit of their own anonymous post. Returns the new body. */
export async function editCommunityPost(input: { postId: number; body: string }): Promise<string> {
  const user = await requireUser()
  const text = input.body.trim()
  if (!text) throw new Error("Your question can't be empty.")
  if (text.length > 1000) throw new Error("Please keep it under 1000 characters.")

  const [post] = await db.select().from(communityPost).where(eq(communityPost.id, input.postId))
  if (!post || post.deleted) throw new Error("This post no longer exists.")
  if (post.userId !== user.id) throw new Error("You can only edit your own post.")

  await db.update(communityPost).set({ body: text }).where(eq(communityPost.id, input.postId))
  revalidatePath("/chatrooms/community")
  return text
}

/** Author-only soft delete of their own anonymous post. */
export async function deleteCommunityPost(postId: number) {
  const user = await requireUser()
  const [post] = await db.select().from(communityPost).where(eq(communityPost.id, postId))
  if (!post) throw new Error("Post not found.")
  if (post.userId !== user.id) throw new Error("You can only delete your own post.")
  await db.update(communityPost).set({ deleted: true }).where(eq(communityPost.id, postId))
  revalidatePath("/chatrooms/community")
}

/** Author-only soft delete of their own comment. */
export async function deleteCommunityComment(commentId: number) {
  const user = await requireUser()
  const [comment] = await db.select().from(communityComment).where(eq(communityComment.id, commentId))
  if (!comment) throw new Error("Comment not found.")
  if (comment.userId !== user.id) throw new Error("You can only delete your own reply.")
  await db.update(communityComment).set({ deleted: true }).where(eq(communityComment.id, commentId))
  revalidatePath("/chatrooms/community")
}
