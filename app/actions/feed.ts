"use server"

import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  feedComment,
  feedPost,
  follow,
  like,
  organization,
  repost,
  savedItem,
  share,
  user as userTable,
} from "@/lib/db/schema"
import { getActiveHomeContext } from "@/lib/home/active-home"
import { resolvePublishingIdentity } from "@/lib/home/publishing"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { formatPostTimestamp } from "@/lib/format-timestamp"
import { getLikedSet, setLike } from "@/lib/likes"
import { notifyUser } from "@/app/actions/notifications"
import { downgradeBlockedMentions, extractMentionRefs, type MentionRef } from "@/lib/mentions"
import { filterAllowedMentions } from "@/lib/mentions-server"

/**
 * Resolves @mention tokens in freshly-authored plain text against each target's
 * privacy setting. Returns the text with any BLOCKED mentions downgraded to
 * inert `@Name` text, plus the list of mentions that are allowed (for storage +
 * notifications). Shared by createPost/editPost and reusable by future surfaces.
 */
async function resolveTextMentions(
  actorId: string,
  text: string,
): Promise<{ text: string; allowed: MentionRef[] }> {
  const refs = extractMentionRefs(text)
  if (refs.length === 0) return { text, allowed: [] }
  const allowed = await filterAllowedMentions(actorId, refs)
  const allowedIds = new Set(allowed.map((m) => m.userId))
  const blocked = new Set(refs.map((m) => m.userId).filter((id) => !allowedIds.has(id)))
  return { text: downgradeBlockedMentions(text, blocked), allowed }
}

/** Sends a "mentioned you" notification to each newly-tagged user. */
async function notifyMentioned(
  actor: { id: string; name: string },
  mentions: MentionRef[],
  link: string,
  previous: MentionRef[] = [],
) {
  const alreadyNotified = new Set(previous.map((m) => m.userId))
  await Promise.all(
    mentions
      .filter((m) => m.userId !== actor.id && !alreadyNotified.has(m.userId))
      .map((m) =>
        notifyUser({
          userId: m.userId,
          actorId: actor.id,
          actorName: actor.name,
          type: "mention",
          message: `${actor.name} mentioned you in a post`,
          link,
        }),
      ),
  )
}

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

export type PostMedia = {
  type: "image" | "video"
  url: string
  /** Optional cover thumbnail chosen in the editor (video frame or custom image). */
  coverImageUrl?: string
  /** Trim range in seconds for videos — playback metadata (no re-encode). */
  trimStart?: number
  trimEnd?: number
  /** Chosen display aspect ratio (width/height), e.g. 1 (1:1), 0.5625 (9:16).
   *  Applied at render as a crop frame — no re-encode. Capped at 9:16 tallness. */
  aspectRatio?: number
}

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
  // When the author is a verified organisation account, surface it so the badge
  // renders on the avatar/name. orgHandle links to the organisation profile.
  orgVerified: boolean
  orgHandle: string | null
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
  // Total times this post has been bookmarked / shared across all users.
  saves: number
  shares: number
  edited: boolean
  isFollowing: boolean
  isSelf: boolean
  // True when the signed-in viewer is one of this post's allowed mentions, so
  // the UI can offer "Remove my mention" without exposing the full list.
  mentionedMe: boolean
  comments: FeedCommentView[]
}

/** Returns the set of userIds the given user follows (empty if signed out). */
async function getFollowingSet(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set()
  const rows = await db
    .select({ followingId: follow.followingId })
    .from(follow)
    .where(eq(follow.followerId, userId))
  return new Set(rows.map((r) => r.followingId))
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

/** Total save (bookmark) count per post across all users, for the given ids. */
async function getPostSaveCounts(postIds: number[]): Promise<Map<number, number>> {
  if (postIds.length === 0) return new Map()
  const keys = postIds.map(String)
  const rows = await db
    .select({ key: savedItem.itemKey, n: count() })
    .from(savedItem)
    .where(and(eq(savedItem.itemType, "post"), inArray(savedItem.itemKey, keys)))
    .groupBy(savedItem.itemKey)
  return new Map(rows.map((r) => [Number(r.key), r.n]))
}

/** Total share count per post across all users, for the given ids. */
async function getPostShareCounts(postIds: number[]): Promise<Map<number, number>> {
  if (postIds.length === 0) return new Map()
  const keys = postIds.map(String)
  const rows = await db
    .select({ key: share.targetKey, n: count() })
    .from(share)
    .where(and(eq(share.targetType, "post"), inArray(share.targetKey, keys)))
    .groupBy(share.targetKey)
  return new Map(rows.map((r) => [Number(r.key), r.n]))
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
type UserInfo = {
  name: string
  image: string | null
}

async function getUserInfoMap(userIds: string[]): Promise<Map<string, UserInfo>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  // Personal identity only. Organisation identity is resolved separately, keyed
  // by each post's own `organizationId` (see getOrgInfoMap), because one owner
  // can now hold several organisations — a join on ownerId here would multiply
  // a user's rows and pick an arbitrary org.
  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, unique))
  return new Map(rows.map((r) => [r.id, { name: r.name, image: r.image }]))
}

// Live organisation identity keyed by organisationId. Used so a post carrying
// an organizationId is always attributed to that organisation — resolved from
// the org row itself, independent of who authored it.
type OrgInfo = { name: string; handle: string; logo: string | null; verified: boolean }

async function getOrgInfoMap(orgIds: (string | null)[]): Promise<Map<string, OrgInfo>> {
  const unique = [...new Set(orgIds.filter((id): id is string => !!id))]
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      handle: organization.handle,
      logo: organization.logo,
      verified: organization.verified,
    })
    .from(organization)
    .where(inArray(organization.id, unique))
  return new Map(
    rows.map((r) => [r.id, { name: r.name, handle: r.handle, logo: r.logo, verified: r.verified ?? false }]),
  )
}

/**
 * Resolves the author identity to render for a feed post. When the post was
 * published on behalf of an organisation (`organizationId` set), it is
 * attributed to the ORGANISATION — its name, @handle, logo and verified badge —
 * so the organisation always speaks as itself and the admin who runs it is never
 * named. Org identity is resolved solely from the post's own `organizationId`
 * (via `orgMap`) so this holds for EVERY Home admin, not only the org owner, and
 * stays correct now that one owner can hold several organisations. Personal
 * posts resolve to the author's current profile. Everything resolves live rather
 * than trusting the denormalized `authorName`, so renaming a user or
 * organisation retroactively updates every past post.
 */
function resolveAuthor(
  p: { userId: string; organizationId: string | null; authorName: string },
  infoMap: Map<string, UserInfo>,
  orgMap?: Map<string, OrgInfo>,
) {
  const info = infoMap.get(p.userId)
  if (p.organizationId) {
    const org = orgMap?.get(p.organizationId)
    if (org) {
      const orgHandle = org.handle || getHandle(org.name)
      return {
        user: org.name,
        handle: orgHandle,
        initials: getInitials(org.name),
        color: getAvatarColor(p.organizationId),
        authorImage: org.logo,
        orgVerified: org.verified,
        orgHandle,
      }
    }
  }
  // Personal post — resolve purely to the author's own current profile. The
  // organisation badge/link only appears on org-attributed posts above.
  const name = info?.name ?? p.authorName
  return {
    user: name,
    handle: getHandle(name),
    initials: getInitials(name),
    color: getAvatarColor(p.userId),
    authorImage: info?.image ?? null,
    orgVerified: false,
    orgHandle: null,
  }
}

// Relative for the first 24h, then an absolute dd/mm/yy date. Shared helper so
// feed posts, comments and replies all format timestamps identically.
const timeAgo = formatPostTimestamp

export async function getFeed(): Promise<FeedPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  // The feed follows the active context. In a Home it shows ONLY posts published
  // INTO that Home (feed_post.homeId === the active Home id). Scoping by the
  // post's own Home — not by author membership — is what keeps content from
  // crossing organisations: an admin who runs several Homes posts into exactly
  // one at a time, and that post appears in that Home alone.
  //
  // In Personal mode the viewer has stepped outside every Home, so the feed
  // shows personal posts (homeId IS NULL) instead. Without either, there is
  // nothing to show and the viewer is sent to onboarding elsewhere.
  const { home, mode } = await getActiveHomeContext()
  if (!home && mode !== "personal") return []
  const contextScope = home ? eq(feedPost.homeId, home.id) : isNull(feedPost.homeId)

  // Only main-feed posts belonging to THIS Home. Room posts (iTestify
  // testimonies, Question of the Day responses) carry a non-null `channel` and
  // are excluded here so they render exclusively inside their own community
  // rooms. Posts come back newest-first; the client decides presentation per tab
  // ("For you" shuffles from this deterministic order, "Following" stays
  // newest-first).
  const posts = await db
    .select()
    .from(feedPost)
    .where(
      and(
        isNull(feedPost.channel),
        eq(feedPost.deleted, false),
        contextScope,
      ),
    )
    .orderBy(desc(feedPost.createdAt))
  if (posts.length === 0) return []
  const postIds = posts.map((p) => p.id)

  // Everything below depends only on the loaded post ids (or on nothing but the
  // viewer), so fire it all in parallel instead of a sequential waterfall. The
  // comments query is scoped to these posts — never a full-table scan.
  const [followingIds, comments, repostedSet, savedSet, saveCounts, shareCounts, likedPostSet] = await Promise.all([
    getFollowingSet(currentUserId),
    db.select().from(feedComment).where(inArray(feedComment.postId, postIds)).orderBy(asc(feedComment.createdAt)),
    getRepostedSet(currentUserId),
    getSavedPostSet(currentUserId),
    getPostSaveCounts(postIds),
    getPostShareCounts(postIds),
    getLikedSet(currentUserId, "post", postIds),
  ])

  // These depend on the comment rows, so run them together after. `orgMap`
  // resolves live organisation identity for every org-attributed post so admins
  // always appear as their organisation, never by personal name.
  const [infoMap, orgMap, likedCommentSet] = await Promise.all([
    getUserInfoMap([...posts.map((p) => p.userId), ...comments.map((c) => c.userId)]),
    getOrgInfoMap(posts.map((p) => p.organizationId)),
    getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id)),
  ])

  // Group comments by post in a single pass (O(n)) so building each post's
  // thread is a Map lookup instead of re-filtering the whole comment list per
  // post (which was O(posts × comments)).
  const commentsByPost = new Map<number, FeedCommentView[]>()
  for (const c of comments) {
    const view = toCommentView(c, infoMap, currentUserId, likedCommentSet)
    const arr = commentsByPost.get(c.postId)
    if (arr) arr.push(view)
    else commentsByPost.set(c.postId, [view])
  }

  return posts.map((p) => ({
    id: p.id,
    authorId: p.userId,
    ...resolveAuthor(p, infoMap, orgMap),
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
    saves: saveCounts.get(p.id) ?? 0,
    shares: shareCounts.get(p.id) ?? 0,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    mentionedMe: currentUserId ? (p.mentions ?? []).some((m) => m.userId === currentUserId) : false,
    comments: commentsByPost.get(p.id) ?? [],
  }))
}

/**
 * Newest-first MAIN-FEED posts authored by a single user, powering their
 * profile "Posts" timeline. Personal posts only (organizationId null) so
 * organisation-attributed posts stay on the org profile, and top-level posts
 * only (channel null) so community-room posts stay in their rooms. Global (not
 * Home-scoped): a profile is the person's own surface, mirroring the per-user
 * community-post timelines. Returns the same rich FeedPostView the main feed
 * uses so the profile can reuse <PostCard> unchanged.
 */
export async function getFeedPostsByUser(userId: string): Promise<FeedPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  const posts = await db
    .select()
    .from(feedPost)
    .where(
      and(
        isNull(feedPost.channel),
        isNull(feedPost.organizationId),
        eq(feedPost.deleted, false),
        eq(feedPost.userId, userId),
      ),
    )
    .orderBy(desc(feedPost.createdAt))
  if (posts.length === 0) return []
  const postIds = posts.map((p) => p.id)

  const [followingIds, comments, repostedSet, savedSet, saveCounts, shareCounts, likedPostSet] = await Promise.all([
    getFollowingSet(currentUserId),
    db.select().from(feedComment).where(inArray(feedComment.postId, postIds)).orderBy(asc(feedComment.createdAt)),
    getRepostedSet(currentUserId),
    getSavedPostSet(currentUserId),
    getPostSaveCounts(postIds),
    getPostShareCounts(postIds),
    getLikedSet(currentUserId, "post", postIds),
  ])

  const [infoMap, likedCommentSet] = await Promise.all([
    getUserInfoMap([...posts.map((p) => p.userId), ...comments.map((c) => c.userId)]),
    getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id)),
  ])

  const commentsByPost = new Map<number, FeedCommentView[]>()
  for (const c of comments) {
    const view = toCommentView(c, infoMap, currentUserId, likedCommentSet)
    const arr = commentsByPost.get(c.postId)
    if (arr) arr.push(view)
    else commentsByPost.set(c.postId, [view])
  }

  return posts.map((p) => ({
    id: p.id,
    authorId: p.userId,
    ...resolveAuthor(p, infoMap),
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
    saves: saveCounts.get(p.id) ?? 0,
    shares: shareCounts.get(p.id) ?? 0,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    mentionedMe: currentUserId ? (p.mentions ?? []).some((m) => m.userId === currentUserId) : false,
    comments: commentsByPost.get(p.id) ?? [],
  }))
}

/**
 * Newest-first MAIN-FEED posts published in an ORGANISATION's voice, powering
 * the org profile "Posts" tab. The mirror image of getFeedPostsByUser: that one
 * takes organizationId IS NULL (personal posts), this one takes a specific
 * organizationId, so a post belongs to exactly one of the two timelines and can
 * never show on both. Scoped by organizationId rather than by owner because one
 * owner can hold several organisations. Returns the same rich FeedPostView as
 * the main feed so the tab can reuse <PostCard> unchanged.
 */
export async function getFeedPostsByOrganization(organizationId: string): Promise<FeedPostView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  const posts = await db
    .select()
    .from(feedPost)
    .where(
      and(
        isNull(feedPost.channel),
        eq(feedPost.organizationId, organizationId),
        eq(feedPost.deleted, false),
      ),
    )
    .orderBy(desc(feedPost.createdAt))
  if (posts.length === 0) return []
  const postIds = posts.map((p) => p.id)

  const [followingIds, comments, repostedSet, savedSet, saveCounts, shareCounts, likedPostSet] = await Promise.all([
    getFollowingSet(currentUserId),
    db.select().from(feedComment).where(inArray(feedComment.postId, postIds)).orderBy(asc(feedComment.createdAt)),
    getRepostedSet(currentUserId),
    getSavedPostSet(currentUserId),
    getPostSaveCounts(postIds),
    getPostShareCounts(postIds),
    getLikedSet(currentUserId, "post", postIds),
  ])

  // orgMap is required here (unlike the personal timeline): every post carries an
  // organizationId, so resolveAuthor needs it to attribute each row to the org's
  // live name/logo/verified state rather than to the admin who typed it.
  const [infoMap, orgMap, likedCommentSet] = await Promise.all([
    getUserInfoMap([...posts.map((p) => p.userId), ...comments.map((c) => c.userId)]),
    getOrgInfoMap(posts.map((p) => p.organizationId)),
    getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id)),
  ])

  const commentsByPost = new Map<number, FeedCommentView[]>()
  for (const c of comments) {
    const view = toCommentView(c, infoMap, currentUserId, likedCommentSet)
    const arr = commentsByPost.get(c.postId)
    if (arr) arr.push(view)
    else commentsByPost.set(c.postId, [view])
  }

  return posts.map((p) => ({
    id: p.id,
    authorId: p.userId,
    ...resolveAuthor(p, infoMap, orgMap),
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
    saves: saveCounts.get(p.id) ?? 0,
    shares: shareCounts.get(p.id) ?? 0,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    mentionedMe: currentUserId ? (p.mentions ?? []).some((m) => m.userId === currentUserId) : false,
    comments: commentsByPost.get(p.id) ?? [],
  }))
}

/**
 * Newest-first posts for a single community room `channel`
 * ("itestify" or "qotd:<questionId>"). Returns the same rich FeedPostView the
 * main feed uses, so room UIs can reuse <PostCard> and all its engagement,
 * comment, media and moderation wiring unchanged.
 */
export async function getChannelFeed(channel: string): Promise<FeedPostView[]> {
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
    .where(and(eq(feedPost.channel, channel), eq(feedPost.deleted, false)))
    .orderBy(desc(feedPost.createdAt))
  if (posts.length === 0) return []

  const postIds = posts.map((p) => p.id)
  const comments = await db
    .select()
    .from(feedComment)
    .where(inArray(feedComment.postId, postIds))
    .orderBy(asc(feedComment.createdAt))
  const repostedSet = await getRepostedSet(currentUserId)
  const savedSet = await getSavedPostSet(currentUserId)
  const saveCounts = await getPostSaveCounts(postIds)
  const shareCounts = await getPostShareCounts(postIds)
  const likedPostSet = await getLikedSet(currentUserId, "post", postIds)
  const likedCommentSet = await getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id))

  const infoMap = await getUserInfoMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  return posts.map((p) => ({
    id: p.id,
    authorId: p.userId,
    ...resolveAuthor(p, infoMap),
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
    saves: saveCounts.get(p.id) ?? 0,
    shares: shareCounts.get(p.id) ?? 0,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    mentionedMe: currentUserId ? (p.mentions ?? []).some((m) => m.userId === currentUserId) : false,
    comments: comments
      .filter((c) => c.postId === p.id)
      .map((c) => toCommentView(c, infoMap, currentUserId, likedCommentSet)),
  }))
}

/**
 * Full-text-ish search over posts for the header search page. Matches the query
 * against the post body (which includes any #hashtags, since those live inline
 * in the text) as well as the author's denormalized name, so a search can find
 * "any correspondence of any post". Returns newest-first, capped for speed.
 */
export async function searchPosts(query: string): Promise<FeedPostView[]> {
  const q = query.trim()
  if (!q) return []

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

  // Search is Home-scoped too: results are limited to posts published into the
  // viewer's active Home, so search can never surface another organisation's
  // content. No active Home => nothing to search.
  const { home } = await getActiveHomeContext()
  if (!home) return []

  const like = `%${q}%`
  const posts = await db
    .select()
    .from(feedPost)
    .where(
      and(
        isNull(feedPost.channel),
        eq(feedPost.deleted, false),
        eq(feedPost.homeId, home.id),
        or(ilike(feedPost.text, like), ilike(feedPost.authorName, like)),
      ),
    )
    .orderBy(desc(feedPost.createdAt))
    .limit(50)

  if (posts.length === 0) return []

  const postIds = posts.map((p) => p.id)
  const comments = await db
    .select()
    .from(feedComment)
    .where(inArray(feedComment.postId, postIds))
    .orderBy(asc(feedComment.createdAt))
  const repostedSet = await getRepostedSet(currentUserId)
  const savedSet = await getSavedPostSet(currentUserId)
  const saveCounts = await getPostSaveCounts(postIds)
  const shareCounts = await getPostShareCounts(postIds)
  const likedPostSet = await getLikedSet(currentUserId, "post", postIds)
  const likedCommentSet = await getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id))

  const infoMap = await getUserInfoMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  return posts.map((p) => ({
    id: p.id,
    authorId: p.userId,
    ...resolveAuthor(p, infoMap),
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
    saves: saveCounts.get(p.id) ?? 0,
    shares: shareCounts.get(p.id) ?? 0,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    mentionedMe: currentUserId ? (p.mentions ?? []).some((m) => m.userId === currentUserId) : false,
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

  // Exclude room-scoped posts (iTestify / Question of the Day) so the profile
  // Posts tab shows only the user's main-feed posts; room content stays in-room.
  const posts = await db
    .select()
    .from(feedPost)
    .where(and(eq(feedPost.userId, userId), isNull(feedPost.channel), eq(feedPost.deleted, false)))
    .orderBy(desc(feedPost.createdAt))
  const comments = await db.select().from(feedComment).orderBy(asc(feedComment.createdAt))
  const repostedSet = await getRepostedSet(currentUserId)
  const savedSet = await getSavedPostSet(currentUserId)
  const saveCounts = await getPostSaveCounts(posts.map((p) => p.id))
  const shareCounts = await getPostShareCounts(posts.map((p) => p.id))
  const likedPostSet = await getLikedSet(currentUserId, "post", posts.map((p) => p.id))
  const likedCommentSet = await getLikedSet(currentUserId, "feed_comment", comments.map((c) => c.id))

  const infoMap = await getUserInfoMap([
    ...posts.map((p) => p.userId),
    ...comments.map((c) => c.userId),
  ])

  return posts.map((p) => ({
    id: p.id,
    authorId: p.userId,
    ...resolveAuthor(p, infoMap),
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
    saves: saveCounts.get(p.id) ?? 0,
    shares: shareCounts.get(p.id) ?? 0,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    mentionedMe: currentUserId ? (p.mentions ?? []).some((m) => m.userId === currentUserId) : false,
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

  const posts = await db
    .select()
    .from(feedPost)
    .where(and(inArray(feedPost.id, postIds), eq(feedPost.deleted, false)))
  const comments = await db.select().from(feedComment).orderBy(asc(feedComment.createdAt))
  const repostedSet = await getRepostedSet(currentUserId)
  const savedSet = await getSavedPostSet(currentUserId)
  const saveCounts = await getPostSaveCounts(posts.map((p) => p.id))
  const shareCounts = await getPostShareCounts(posts.map((p) => p.id))
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
    ...resolveAuthor(p, infoMap),
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
    saves: saveCounts.get(p.id) ?? 0,
    shares: shareCounts.get(p.id) ?? 0,
    edited: !!p.editedAt,
    isFollowing: followingIds.has(p.userId),
    isSelf: currentUserId === p.userId,
    mentionedMe: currentUserId ? (p.mentions ?? []).some((m) => m.userId === currentUserId) : false,
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
  // Scopes the post to a community room instead of the main feed:
  // "itestify" (a testimony) or "qotd:<questionId>" (a Question of the Day
  // response). Omitted/null for a normal feed post.
  channel?: string | null
}) {
  const user = await requireUser()

  const channel = input.channel?.trim() || null

  // Publishing identity comes from the ACTIVE context and the author's role in
  // THAT Home — never from any global "does this user own an organisation?"
  // lookup. See lib/home/publishing.ts for the full rule and the bug it fixes.
  //
  // Room posts (channel !== null) stay Home-agnostic: they live in their own
  // community rooms, so they're always personal and carry no Home.
  let organizationId: string | null = null
  let isOrganization = false
  let authorName = user.name
  let authorHandle = getHandle(user.name)
  let homeId: string | null = null
  // Immutable publication-context stamp, persisted so a later role change can
  // never rewrite this post's identity.
  let publishedAsType = "personal"
  let publishedAsRole: string | null = null

  if (channel === null) {
    const { home, mode } = await getActiveHomeContext()
    // A main-feed post needs somewhere to appear: either a Home, or the author's
    // own personal feed when they've deliberately switched to Personal mode.
    if (!home && mode !== "personal") {
      throw new Error("Join or select a Home before posting to the Feed.")
    }

    const identity = await resolvePublishingIdentity({
      name: user.name,
      handle: getHandle(user.name),
      image: user.image ?? null,
    })

    homeId = identity.homeId
    authorName = identity.name
    authorHandle = identity.handle
    publishedAsType = identity.type
    publishedAsRole = identity.role
    if (identity.type === "home") {
      isOrganization = true
      organizationId = identity.organizationId
    }
  }

  // Resolve @mentions (privacy-checked); blocked ones become inert text.
  const { text, allowed: mentions } = await resolveTextMentions(user.id, input.text.trim())

  // Accept either the new ordered media array or the legacy single image/video.
  const media: PostMedia[] = (input.media ?? []).filter((m) => m && m.url).slice(0, 10)
  if (media.length === 0) {
    if (input.image) media.push({ type: "image", url: input.image })
    else if (input.video) media.push({ type: "video", url: input.video })
  }
  // Business rule (top-level main-feed posts only): individual accounts MUST
  // include at least one photo or video. "Media" means photos/videos only —
  // text, links, and other attachments never satisfy this. Organisations may
  // post text-only. Replies/comments are separate actions and never gated here.
  if (channel === null && !isOrganization && media.length === 0) {
    throw new Error("Add a photo or video to share on the Feed.")
  }
  if (!text && media.length === 0) throw new Error("Post cannot be empty.")

  // Mirror the first item into the legacy columns so older readers still work.
  const first = media[0] ?? null

  const [inserted] = await db
    .insert(feedPost)
    .values({
      userId: user.id,
      organizationId,
      authorName,
      authorHandle,
      text,
      image: first?.type === "image" ? first.url : null,
      video: first?.type === "video" ? first.url : null,
      media: media.length > 0 ? media : null,
      channel,
      homeId,
      publishedAsType,
      publishedAsRole,
      mentions: mentions.length > 0 ? mentions : null,
    })
    .returning({ id: feedPost.id })

  // Note: new posts intentionally do NOT notify followers. Notifications are
  // reserved for when a followed user goes live (see app/actions/live.ts).
  // Tagged users, however, are always notified.
  if (inserted?.id) {
    await notifyMentioned(user, mentions, `/feed?post=${inserted.id}`)
  }

  // Revalidate the author's profile too so the new post shows up immediately —
  // and, since posts are ordered newest-first, as the first tile on the Posts tab.
  revalidatePath("/feed")
  revalidatePath(`/u/${user.id}`)
  // Keep the room views fresh when posting a testimony / QOTD response.
  if (channel === "itestify") revalidatePath("/chatrooms/itestify")
  else if (channel?.startsWith("qotd:")) revalidatePath("/chatrooms/questions")

  // Return the new id so the client can float this post to the top of the feed.
  return { id: inserted?.id ?? null }
}

/** Edits the text of one of the signed-in user's own posts (media is unchanged). */
export async function editPost(input: { postId: number; text: string }) {
  const user = await requireUser()
  const [row] = await db
    .select({ userId: feedPost.userId, image: feedPost.image, video: feedPost.video, mentions: feedPost.mentions })
    .from(feedPost)
    .where(eq(feedPost.id, input.postId))
  if (!row) throw new Error("Post not found.")
  if (row.userId !== user.id) throw new Error("You can only edit your own posts.")

  // Re-resolve @mentions on the edited text (privacy-checked); only users newly
  // tagged in this edit get notified (see notifyMentioned's `previous` guard).
  const { text, allowed: mentions } = await resolveTextMentions(user.id, input.text.trim())
  // A post must still have content after the edit — keep it non-empty unless
  // there's attached media to carry it.
  if (!text && !row.image && !row.video) throw new Error("Post cannot be empty.")

  await db
    .update(feedPost)
    .set({ text, editedAt: new Date(), mentions: mentions.length > 0 ? mentions : null })
    .where(and(eq(feedPost.id, input.postId), eq(feedPost.userId, user.id)))

  await notifyMentioned(user, mentions, `/feed?post=${input.postId}`, row.mentions ?? [])

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
  // A user can never like their own post — silently ignore any such request
  // (the UI already hides the action for the author, this is the server guard).
  if (row.userId === user.id) return
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

/** A single account that engaged (liked or saved) a post, for the author's list. */
export type PostEngager = {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  image: string | null
}

// Resolves a set of userIds into display-ready engager rows, preserving the
// given id order (which callers pass most-recent-first).
async function toEngagers(userIds: string[]): Promise<PostEngager[]> {
  if (userIds.length === 0) return []
  const infoMap = await getUserInfoMap(userIds)
  return userIds.map((id) => {
    const name = infoMap.get(id)?.name ?? "Someone"
    return {
      id,
      name,
      handle: getHandle(name),
      initials: getInitials(name),
      color: getAvatarColor(id),
      image: infoMap.get(id)?.image ?? null,
    }
  })
}

/**
 * The unique accounts that have liked a post. Restricted to the post's author —
 * a user can only see who liked their own post. Ordered most-recent-first.
 */
export async function getPostLikers(postId: number): Promise<PostEngager[]> {
  const user = await requireUser()
  const [post] = await db.select({ userId: feedPost.userId }).from(feedPost).where(eq(feedPost.id, postId))
  if (!post || post.userId !== user.id) return []
  const rows = await db
    .select({ userId: like.userId })
    .from(like)
    .where(and(eq(like.targetType, "post"), eq(like.targetId, postId)))
    .orderBy(desc(like.createdAt))
  return toEngagers(rows.map((r) => r.userId))
}

/**
 * The unique accounts that have saved (bookmarked) a post. Restricted to the
 * post's author. Ordered most-recent-first.
 */
export async function getPostSavers(postId: number): Promise<PostEngager[]> {
  const user = await requireUser()
  const [post] = await db.select({ userId: feedPost.userId }).from(feedPost).where(eq(feedPost.id, postId))
  if (!post || post.userId !== user.id) return []
  const rows = await db
    .select({ userId: savedItem.userId })
    .from(savedItem)
    .where(and(eq(savedItem.itemType, "post"), eq(savedItem.itemKey, String(postId))))
    .orderBy(desc(savedItem.createdAt))
  // savedItem has no unique constraint; de-dupe defensively so the count matches
  // unique accounts.
  const seen = new Set<string>()
  const uniqueIds = rows.map((r) => r.userId).filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
  return toEngagers(uniqueIds)
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
