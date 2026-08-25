"use server"

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { communityComment, communityPost, home, homeMembership, organization, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { formatPostTimestamp } from "@/lib/format-timestamp"
import { EDIT_WINDOW_MS } from "@/lib/interactions"
import { getLikedSet, setLike } from "@/lib/likes"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

// Relative for the first 24h, then an absolute dd/mm/yy date. Shared with the
// social feed so all post-style timestamps format identically.
const timeAgo = formatPostTimestamp

export type CommunityPostView = {
  id: number
  body: string
  // Optional attached image (Vercel Blob URL). Shown to everyone — the image is
  // part of the anonymous question, never tied to the hidden author identity.
  imageUrl: string | null
  // Optional attached video (Vercel Blob URL). Same principle as imageUrl.
  videoUrl: string | null
  postedAt: string
  createdAtMs: number
  edited: boolean
  commentCount: number
  // Like count + whether the signed-in viewer has liked this post.
  likes: number
  liked: boolean
  // True when the signed-in user authored this post. Used to allow self-delete
  // and to reveal the author's own identity to themselves only.
  isSelf: boolean
  // Whether the author chose to post anonymously. When false the post is
  // identifiable and the author fields below are populated for EVERY viewer.
  anonymous: boolean
  // Author identity — populated for identifiable posts (anonymous=false, shown
  // to everyone) and for the author's own posts (isSelf, shown only to them).
  // For anonymous posts viewed by anyone else these stay null.
  // authorId is exposed under the same rules so an identifiable author's
  // profile can be opened; it stays null for anonymous posts by others.
  authorId: string | null
  authorName: string | null
  authorHandle: string | null
  authorInitials: string | null
  authorColor: string | null
  authorImage: string | null
  // Set when the thread was published in an ORGANISATION's voice. The author
  // fields above then carry the ORG's name/handle/logo rather than the admin's,
  // and authorId stays null so the row never links to the individual who typed
  // it. Null for personal threads, which keep normal author attribution.
  organizationId: string | null
}

export type CommunityCommentView = {
  id: number
  parentId: number | null
  userId: string
  userName: string
  handle: string
  initials: string
  color: string
  image: string | null
  body: string
  likes: number
  liked: boolean
  edited: boolean
  postedAt: string
  createdAtMs: number
  isSelf: boolean
}

/**
 * Shared mapper: turns raw community_post rows into client views for a given
 * viewer. Resolves reply counts, per-viewer like state, and author identity
 * under the anonymity rules (identifiable posts reveal to everyone; anonymous
 * posts reveal only to their own author). Reused by the room feed and by the
 * per-user profile timelines so they all stay consistent.
 */
async function buildCommunityPostViews(
  posts: (typeof communityPost.$inferSelect)[],
  viewerId: string | null,
): Promise<CommunityPostView[]> {
  const ids = posts.map((p) => p.id)
  const countMap = new Map<number, number>()
  if (ids.length) {
    const comments = await db
      .select({ postId: communityComment.postId })
      .from(communityComment)
      .where(and(inArray(communityComment.postId, ids), eq(communityComment.deleted, false)))
    for (const c of comments) countMap.set(c.postId, (countMap.get(c.postId) ?? 0) + 1)
  }

  const likedSet = await getLikedSet(viewerId, "community_post", ids)

  // Resolve profiles for every author whose identity may be shown: identifiable
  // posts (anonymous=false, revealed to everyone) plus the viewer's own posts
  // (revealed only to them). Anonymous posts by others are never resolved, so
  // their author identity is never sent to the client.
  const revealIds = [
    ...new Set(posts.filter((p) => !p.anonymous || p.userId === viewerId).map((p) => p.userId)),
  ]
  const profileMap = new Map<string, { name: string; image: string | null }>()
  if (revealIds.length) {
    const rows = await db
      .select({ id: userTable.id, name: userTable.name, image: userTable.image })
      .from(userTable)
      .where(inArray(userTable.id, revealIds))
    for (const r of rows) profileMap.set(r.id, { name: r.name, image: r.image })
  }

  // Live organisation identity for org-voice threads, keyed by organizationId so
  // attribution follows the org row (current name/logo) rather than the author.
  const orgIds = [...new Set(posts.map((p) => p.organizationId).filter((id): id is string => !!id))]
  const orgMap = new Map<string, { name: string; handle: string | null; logo: string | null }>()
  if (orgIds.length) {
    const rows = await db
      .select({ id: organization.id, name: organization.name, handle: organization.handle, logo: organization.logo })
      .from(organization)
      .where(inArray(organization.id, orgIds))
    for (const r of rows) orgMap.set(r.id, { name: r.name, handle: r.handle, logo: r.logo })
  }

  return posts.map((p) => {
    const isSelf = viewerId === p.userId
    // Identity is visible when the post is identifiable (to everyone) or when
    // the viewer is the author (to themselves).
    const reveal = !p.anonymous || isSelf
    const profile = reveal ? profileMap.get(p.userId) ?? null : null
    // Org-voice threads speak as the organisation. Only applied to identifiable
    // threads: an anonymous thread must stay anonymous, and substituting the org
    // name onto it would both break that and reveal which org the author belongs
    // to. authorId is left null below so an org-voice row never deep-links to
    // the admin who typed it.
    const org = !p.anonymous && p.organizationId ? orgMap.get(p.organizationId) ?? null : null
    return {
      id: p.id,
      body: p.body,
      imageUrl: p.imageUrl ?? null,
      videoUrl: p.videoUrl ?? null,
      postedAt: timeAgo(p.createdAt),
      createdAtMs: p.createdAt.getTime(),
      edited: !!p.editedAt,
      commentCount: countMap.get(p.id) ?? 0,
      likes: p.likes,
      liked: likedSet.has(p.id),
      isSelf,
      anonymous: p.anonymous,
      organizationId: p.organizationId ?? null,
      authorId: org ? null : reveal ? p.userId : null,
      authorName: org ? org.name : profile ? profile.name : null,
      authorHandle: org ? org.handle ?? getHandle(org.name) : profile ? getHandle(profile.name) : null,
      authorInitials: org ? getInitials(org.name) : profile ? getInitials(profile.name) : null,
      authorColor: org ? getAvatarColor(p.organizationId!) : reveal ? getAvatarColor(p.userId) : null,
      authorImage: org ? org.logo : profile ? profile.image : null,
    }
  })
}

/**
 * Newest-first feed of community posts with reply counts, scoped by Home.
 *
 * - `homeId` omitted / null → the Universal (global) Community Help. Only posts
 *   with no Home scope are returned, so a private Home's threads never leak into
 *   the public room.
 * - `homeId` set → that organisation's PRIVATE Community Help. Callers are
 *   responsible for verifying the viewer is an active member of the Home first
 *   (the Home routes do this via requireHomeMembership).
 */
export async function getCommunityPosts(homeId?: string | null): Promise<CommunityPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const scope = homeId ? eq(communityPost.homeId, homeId) : isNull(communityPost.homeId)

  const posts = await db
    .select()
    .from(communityPost)
    .where(and(eq(communityPost.deleted, false), scope))
    .orderBy(desc(communityPost.createdAt))
    .limit(200)

  return buildCommunityPostViews(posts, viewerId)
}

/**
 * A user's PUBLIC (identifiable) Community Help posts, newest-first — powers the
 * profile "Posts" timeline. Anonymous posts are excluded here so they never
 * appear in the public identity timeline. Visible to every viewer.
 */
export async function getPublicCommunityPostsByUser(userId: string): Promise<CommunityPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const posts = await db
    .select()
    .from(communityPost)
    .where(
      and(
        eq(communityPost.userId, userId),
        eq(communityPost.anonymous, false),
        eq(communityPost.deleted, false),
      ),
    )
    .orderBy(desc(communityPost.createdAt))

  return buildCommunityPostViews(posts, viewerId)
}

/**
 * A user's OWN anonymous Community Help posts, newest-first — powers the profile
 * "Anonymous" timeline. Strictly owner-only: if the viewer isn't the profile
 * owner we return nothing, so other members get no signal that any anonymous
 * posts exist or how many there are.
 */
export async function getAnonymousCommunityPostsByUser(userId: string): Promise<CommunityPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null
  if (!viewerId || viewerId !== userId) return []

  const posts = await db
    .select()
    .from(communityPost)
    .where(
      and(
        eq(communityPost.userId, userId),
        eq(communityPost.anonymous, true),
        eq(communityPost.deleted, false),
      ),
    )
    .orderBy(desc(communityPost.createdAt))

  return buildCommunityPostViews(posts, viewerId)
}

/**
 * An organisation's ORG-VOICE Community Help threads, newest-first — powers the
 * org profile "Thread" tab. Scoped by organizationId, so only threads an admin
 * deliberately published as the organisation appear here; members' personal
 * threads (including personal threads inside the org's private Home) never do.
 *
 * Anonymous org-voice threads are returned ONLY to the organisation's owner and
 * administrators. For everyone else they are filtered out in SQL, so a public
 * visitor receives no row at all — not a redacted one — and therefore gets no
 * signal that an anonymous thread exists or how many there are.
 */
export async function getOrgCommunityPosts(organizationId: string): Promise<CommunityPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const isAdmin = viewerId ? await isOrgAdmin(organizationId, viewerId) : false

  const posts = await db
    .select()
    .from(communityPost)
    .where(
      and(
        eq(communityPost.organizationId, organizationId),
        eq(communityPost.deleted, false),
        // Non-admins only ever see identifiable org-voice threads.
        ...(isAdmin ? [] : [eq(communityPost.anonymous, false)]),
      ),
    )
    .orderBy(desc(communityPost.createdAt))
    .limit(200)

  return buildCommunityPostViews(posts, viewerId)
}

/**
 * True when the viewer owns the organisation or holds an admin-level role in its
 * Home. Used to gate anonymous org-voice threads on the org profile.
 */
async function isOrgAdmin(organizationId: string, viewerId: string): Promise<boolean> {
  const [org] = await db
    .select({ ownerId: organization.ownerId })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  if (!org) return false
  if (org.ownerId === viewerId) return true

  const rows = await db
    .select({ role: homeMembership.role })
    .from(homeMembership)
    .innerJoin(home, eq(home.id, homeMembership.homeId))
    .where(
      and(
        eq(home.organizationId, organizationId),
        eq(homeMembership.userId, viewerId),
        eq(homeMembership.status, "active"),
        isNull(home.deletedAt),
      ),
    )
    .limit(1)
  if (rows.length === 0) return false
  return rows[0].role === "owner" || rows[0].role === "administrator"
}

/**
 * Creates a post in the Community Help room, optionally with an image or video.
 * `anonymous` is the author's choice: true (default) hides their identity from
 * other members; false posts it identifiably with their name + avatar.
 */
export async function createCommunityPost(
  body: string,
  imageUrl?: string | null,
  videoUrl?: string | null,
  anonymous = true,
  homeId?: string | null,
  // When set, publish in this ORGANISATION's voice instead of the author's. Only
  // the org's owner/administrators may do this; the check is server-side because
  // a client could otherwise stamp any organisation's id onto its own thread.
  organizationId?: string | null,
): Promise<CommunityPostView> {
  const user = await requireUser()
  const orgId = organizationId?.trim() || null
  if (orgId && !(await isOrgAdmin(orgId, user.id))) {
    throw new Error("You don't have permission to post as that organisation.")
  }
  const text = body.trim()
  const image = imageUrl?.trim() || null
  const video = videoUrl?.trim() || null
  if (!text && !image && !video) throw new Error("Add a question, an image, or a video.")
  if (text.length > 1000) throw new Error("Please keep it under 1000 characters.")
  // Only accept our own Vercel Blob URLs so a client can't stash arbitrary links.
  const blobUrl = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i
  if (image && !blobUrl.test(image)) {
    throw new Error("That image couldn't be attached.")
  }
  if (video && !blobUrl.test(video)) {
    throw new Error("That video couldn't be attached.")
  }

  const [row] = await db
    .insert(communityPost)
    // homeId stamps the post to a private Home when provided; null keeps it in
    // the Universal room. The author id is always stored for moderation.
    .values({
      userId: user.id,
      body: text,
      imageUrl: image,
      videoUrl: video,
      anonymous,
      homeId: homeId ?? null,
      organizationId: orgId,
    })
    .returning()

  // Resolve the org's own identity so the optimistic row returned to the client
  // matches what a refetch will render, rather than briefly flashing the admin's
  // personal name and avatar on a thread published as the organisation.
  const orgRow = orgId && !row.anonymous ? await getOrgIdentity(orgId) : null

  revalidatePath("/chatrooms/community")
  return {
    id: row.id,
    body: row.body,
    imageUrl: row.imageUrl ?? null,
    videoUrl: row.videoUrl ?? null,
    postedAt: "now",
    createdAtMs: row.createdAt.getTime(),
    edited: false,
    commentCount: 0,
    likes: 0,
    liked: false,
    isSelf: true,
    anonymous: row.anonymous,
    organizationId: row.organizationId ?? null,
    authorId: orgRow ? null : user.id,
    authorName: orgRow ? orgRow.name : user.name,
    authorHandle: orgRow ? orgRow.handle ?? getHandle(orgRow.name) : getHandle(user.name),
    authorInitials: orgRow ? getInitials(orgRow.name) : getInitials(user.name),
    authorColor: orgRow ? getAvatarColor(orgId!) : getAvatarColor(user.id),
    authorImage: orgRow ? orgRow.logo : user.image ?? null,
  }
}

/** Live name/handle/logo for a single organisation, for org-voice attribution. */
async function getOrgIdentity(
  organizationId: string,
): Promise<{ name: string; handle: string | null; logo: string | null } | null> {
  const [row] = await db
    .select({ name: organization.name, handle: organization.handle, logo: organization.logo })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  return row ?? null
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

  const likedSet = await getLikedSet(viewerId, "community_comment", rows.map((r) => r.id))

  return rows.map((r) => ({
    id: r.id,
    parentId: r.parentId ?? null,
    userId: r.userId,
    userName: r.userName,
    handle: getHandle(r.userName),
    initials: getInitials(r.userName),
    color: getAvatarColor(r.userId),
    image: imageMap.get(r.userId) ?? null,
    body: r.body,
    likes: r.likes,
    liked: likedSet.has(r.id),
    edited: !!r.editedAt,
    postedAt: timeAgo(r.createdAt),
    createdAtMs: r.createdAt.getTime(),
    isSelf: viewerId === r.userId,
  }))
}

/** Adds a non-anonymous reply to a post. */
export async function addCommunityComment(input: {
  postId: number
  body: string
  parentId?: number | null
}): Promise<CommunityCommentView> {
  const user = await requireUser()
  const text = input.body.trim()
  if (!text) throw new Error("Your reply can't be empty.")
  if (text.length > 1000) throw new Error("Please keep it under 1000 characters.")

  const [post] = await db.select().from(communityPost).where(eq(communityPost.id, input.postId))
  if (!post || post.deleted) throw new Error("This post no longer exists.")

  const [row] = await db
    .insert(communityComment)
    .values({ postId: input.postId, parentId: input.parentId ?? null, userId: user.id, userName: user.name, body: text })
    .returning()

  const [profile] = await db
    .select({ image: userTable.image })
    .from(userTable)
    .where(eq(userTable.id, user.id))

  revalidatePath("/chatrooms/community")
  return {
    id: row.id,
    parentId: row.parentId ?? null,
    userId: user.id,
    userName: user.name,
    handle: getHandle(user.name),
    initials: getInitials(user.name),
    color: getAvatarColor(user.id),
    image: profile?.image ?? null,
    body: row.body,
    likes: 0,
    liked: false,
    edited: false,
    postedAt: "now",
    createdAtMs: row.createdAt.getTime(),
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

  await db.update(communityPost).set({ body: text, editedAt: new Date() }).where(eq(communityPost.id, input.postId))
  revalidatePath("/chatrooms/community")
  return text
}

/** Author-only edit of their own comment, within the edit window. */
export async function editCommunityComment(input: { commentId: number; body: string }): Promise<string> {
  const user = await requireUser()
  const text = input.body.trim()
  if (!text) throw new Error("Your reply can't be empty.")
  if (text.length > 1000) throw new Error("Please keep it under 1000 characters.")

  const [comment] = await db.select().from(communityComment).where(eq(communityComment.id, input.commentId))
  if (!comment || comment.deleted) throw new Error("This reply no longer exists.")
  if (comment.userId !== user.id) throw new Error("You can only edit your own reply.")
  if (Date.now() - comment.createdAt.getTime() > EDIT_WINDOW_MS) throw new Error("This reply can no longer be edited.")

  await db
    .update(communityComment)
    .set({ body: text, editedAt: new Date() })
    .where(eq(communityComment.id, input.commentId))
  revalidatePath("/chatrooms/community")
  return text
}

/** Toggle a like on a community comment. Idempotent — persists per-user state. */
export async function setCommunityCommentLike(input: { commentId: number; liked: boolean }) {
  const user = await requireUser()
  const [row] = await db
    .select({ likes: communityComment.likes })
    .from(communityComment)
    .where(eq(communityComment.id, input.commentId))
  if (!row) return
  const { changed } = await setLike(user.id, "community_comment", input.commentId, input.liked)
  if (!changed) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(communityComment).set({ likes: next }).where(eq(communityComment.id, input.commentId))
  revalidatePath("/chatrooms/community")
}

/** Toggle a like on an anonymous community post. Idempotent — persists per-user state. */
export async function setCommunityPostLike(input: { postId: number; liked: boolean }) {
  const user = await requireUser()
  const [row] = await db
    .select({ likes: communityPost.likes })
    .from(communityPost)
    .where(eq(communityPost.id, input.postId))
  if (!row) return
  const { changed } = await setLike(user.id, "community_post", input.postId, input.liked)
  if (!changed) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(communityPost).set({ likes: next }).where(eq(communityPost.id, input.postId))
  revalidatePath("/chatrooms/community")
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
