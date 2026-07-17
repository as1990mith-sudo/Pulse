"use server"

import { and, desc, eq, ilike, inArray, ne, or } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { dmConversation, episode, feedPost, follow, savedItem, statusUpdate, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { getOrCreateConversation, sendDirectMessage } from "@/app/actions/dm"
import { createStatus } from "@/app/actions/status"
import type { ShareSuggestion, ShareTarget } from "@/lib/share-types"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/** Builds an absolute URL for an app-relative path using the request headers. */
async function toAbsoluteUrl(path: string): Promise<string> {
  if (/^https?:\/\//i.test(path)) return path
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "https"
  if (!host) return path
  return `${proto}://${host}${path.startsWith("/") ? "" : "/"}${path}`
}

function toSuggestion(
  row: { id: string; name: string; image: string | null },
  mutual: boolean,
): ShareSuggestion {
  return {
    id: row.id,
    name: row.name,
    handle: getHandle(row.name),
    initials: getInitials(row.name),
    color: getAvatarColor(row.id),
    image: row.image,
    mutual,
  }
}

/**
 * Ranked share suggestions for the current user, Instagram-style:
 *   1. mutual followers (we follow each other)
 *   2. most recent DM chats
 *   3. people I follow
 *   4. people who follow me
 * Returns up to `limit` users. Signed-out users get an empty list.
 */
export async function getShareSuggestions(limit = 60): Promise<ShareSuggestion[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return []
  const me = session.user.id

  const [followingRows, followerRows, convRows] = await Promise.all([
    db.select({ id: follow.followingId }).from(follow).where(eq(follow.followerId, me)),
    db.select({ id: follow.followerId }).from(follow).where(eq(follow.followingId, me)),
    db
      .select({ a: dmConversation.userAId, b: dmConversation.userBId, at: dmConversation.lastMessageAt })
      .from(dmConversation)
      .where(or(eq(dmConversation.userAId, me), eq(dmConversation.userBId, me)))
      .orderBy(desc(dmConversation.lastMessageAt))
      .limit(100),
  ])

  const following = new Set(followingRows.map((r) => r.id))
  const followers = new Set(followerRows.map((r) => r.id))

  // Recency rank for users I've chatted with (lower index = more recent).
  const chatRank = new Map<string, number>()
  convRows.forEach((c, i) => {
    const other = c.a === me ? c.b : c.a
    if (!chatRank.has(other)) chatRank.set(other, i)
  })

  // Candidate pool: anyone I follow, who follows me, or whom I've chatted with.
  const candidateIds = new Set<string>([...following, ...followers, ...chatRank.keys()])
  candidateIds.delete(me)
  if (candidateIds.size === 0) return []

  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, [...candidateIds]))

  const scored = rows.map((row) => {
    const mutual = following.has(row.id) && followers.has(row.id)
    const hasChat = chatRank.has(row.id)
    // Lower sort tuple = ranked higher.
    const tier = mutual ? 0 : hasChat ? 1 : following.has(row.id) ? 2 : 3
    const recency = chatRank.has(row.id) ? chatRank.get(row.id)! : Number.MAX_SAFE_INTEGER
    return { row, mutual, sort: [tier, recency] as const, name: row.name }
  })

  scored.sort((x, y) => {
    if (x.sort[0] !== y.sort[0]) return x.sort[0] - y.sort[0]
    if (x.sort[1] !== y.sort[1]) return x.sort[1] - y.sort[1]
    return x.name.localeCompare(y.name)
  })

  return scored.slice(0, limit).map((s) => toSuggestion(s.row, s.mutual))
}

/** Search users by display name or handle for the share sheet search box. */
export async function searchShareUsers(query: string): Promise<ShareSuggestion[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return []
  const me = session.user.id
  const q = query.trim()
  if (q.length < 1) return []

  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(userTable)
    .where(and(ne(userTable.id, me), ilike(userTable.name, `%${q}%`)))
    .orderBy(userTable.name)
    .limit(30)

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const [followingRows, followerRows] = await Promise.all([
    db
      .select({ id: follow.followingId })
      .from(follow)
      .where(and(eq(follow.followerId, me), inArray(follow.followingId, ids))),
    db
      .select({ id: follow.followerId })
      .from(follow)
      .where(and(eq(follow.followingId, me), inArray(follow.followerId, ids))),
  ])
  const following = new Set(followingRows.map((r) => r.id))
  const followers = new Set(followerRows.map((r) => r.id))

  return rows.map((row) => toSuggestion(row, following.has(row.id) && followers.has(row.id)))
}

/**
 * Shares a target internally to one or more users via Frequency DMs. Each
 * recipient receives a message with the preview image (as an attachment), the
 * title, and a clickable absolute link. Sender info is implicit in the DM.
 */
export async function shareToUsers(input: { recipientIds: string[]; target: ShareTarget; note?: string }) {
  await requireUser()
  const recipients = [...new Set(input.recipientIds)].filter(Boolean)
  if (recipients.length === 0) throw new Error("Pick at least one person to share with.")

  const absoluteUrl = await toAbsoluteUrl(input.target.url)
  const note = input.note?.trim()
  // Share only the link. The recipient's chat renders it as a rich preview
  // card (WhatsApp-style), so we deliberately omit the title, subtitle, and
  // image attachment here. An optional note is kept above the link.
  const body = note ? `${note}\n${absoluteUrl}` : absoluteUrl

  for (const recipientId of recipients) {
    const conversationId = await getOrCreateConversation(recipientId)
    await sendDirectMessage({
      conversationId,
      body,
    })
  }

  revalidatePath("/messages")
  return { sent: recipients.length }
}

export type SavedItemView = {
  id: number
  type: string
  key: string
  title: string | null
  subtitle: string | null
  url: string
  image: string | null
  // Display identity of the user who owns the saved content (post author,
  // episode host, status owner). Resolved at read time so even items saved
  // before this existed show the right avatar. Null when unknown.
  ownerName: string | null
  ownerImage: string | null
  ownerInitials: string | null
  ownerColor: string | null
}

/**
 * Returns the current user's saved items (bookmarks), newest first. Powers the
 * private "Saved" tab on the user's own profile. Signed-out users get [].
 */
export async function getSavedItems(): Promise<SavedItemView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return []
  const rows = await db
    .select()
    .from(savedItem)
    .where(eq(savedItem.userId, session.user.id))
    .orderBy(desc(savedItem.createdAt))

  // Resolve each saved item's owning user so we can show their avatar. We batch
  // one query per content type, keyed by the item's stored `itemKey`.
  const postIds = rows.filter((r) => r.itemType === "post").map((r) => Number(r.itemKey)).filter((n) => !Number.isNaN(n))
  const episodeIds = rows
    .filter((r) => r.itemType === "episode")
    .map((r) => Number(r.itemKey))
    .filter((n) => !Number.isNaN(n))
  const statusIds = rows
    .filter((r) => r.itemType === "status")
    .map((r) => Number(r.itemKey))
    .filter((n) => !Number.isNaN(n))

  const [postRows, episodeRows, statusRows] = await Promise.all([
    postIds.length > 0
      ? db.select({ key: feedPost.id, userId: feedPost.userId }).from(feedPost).where(inArray(feedPost.id, postIds))
      : Promise.resolve([] as { key: number; userId: string }[]),
    episodeIds.length > 0
      ? db
          .select({ key: episode.id, userId: episode.hostUserId, hostName: episode.hostName })
          .from(episode)
          .where(inArray(episode.id, episodeIds))
      : Promise.resolve([] as { key: number; userId: string | null; hostName: string }[]),
    statusIds.length > 0
      ? db
          .select({ key: statusUpdate.id, userId: statusUpdate.userId, authorName: statusUpdate.authorName })
          .from(statusUpdate)
          .where(inArray(statusUpdate.id, statusIds))
      : Promise.resolve([] as { key: number; userId: string; authorName: string }[]),
  ])

  // Map itemKey -> owning userId (and a fallback display name when there's no
  // linked account, e.g. admin-added episodes that only store a host name).
  const ownerByKey = new Map<string, { userId: string | null; fallbackName: string | null }>()
  postRows.forEach((p) => ownerByKey.set(`post:${p.key}`, { userId: p.userId, fallbackName: null }))
  episodeRows.forEach((e) => ownerByKey.set(`episode:${e.key}`, { userId: e.userId, fallbackName: e.hostName }))
  statusRows.forEach((s) => ownerByKey.set(`status:${s.key}`, { userId: s.userId, fallbackName: s.authorName }))

  // Fetch the user records we need in one go.
  const ownerUserIds = [
    ...new Set([...ownerByKey.values()].map((o) => o.userId).filter((id): id is string => Boolean(id))),
  ]
  const ownerUsers =
    ownerUserIds.length > 0
      ? await db
          .select({ id: userTable.id, name: userTable.name, image: userTable.image })
          .from(userTable)
          .where(inArray(userTable.id, ownerUserIds))
      : []
  const userById = new Map(ownerUsers.map((u) => [u.id, u]))

  return rows.map((r) => {
    const owner = ownerByKey.get(`${r.itemType}:${r.itemKey}`)
    const ownerUser = owner?.userId ? userById.get(owner.userId) : undefined
    const ownerName = ownerUser?.name ?? owner?.fallbackName ?? null
    return {
      id: r.id,
      type: r.itemType,
      key: r.itemKey,
      title: r.title,
      subtitle: r.subtitle,
      url: r.url,
      image: r.image,
      ownerName,
      ownerImage: ownerUser?.image ?? null,
      ownerInitials: ownerName ? getInitials(ownerName) : null,
      ownerColor: owner?.userId ? getAvatarColor(owner.userId) : ownerName ? getAvatarColor(ownerName) : null,
    }
  })
}

/** Returns whether the current user has saved the given item. */
export async function isItemSaved(itemType: string, itemKey: string): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return false
  const existing = await db
    .select({ id: savedItem.id })
    .from(savedItem)
    .where(
      and(
        eq(savedItem.userId, session.user.id),
        eq(savedItem.itemType, itemType),
        eq(savedItem.itemKey, itemKey),
      ),
    )
    .limit(1)
  return existing.length > 0
}

/** Saves or unsaves an item for the current user. Returns the new state. */
export async function toggleSaveItem(target: ShareTarget): Promise<{ saved: boolean }> {
  const user = await requireUser()

  // A user can't save their own post (mirrors the like rule). For posts, the
  // author instead uses this button to view who saved it, so block the write.
  if (target.type === "post") {
    const [post] = await db
      .select({ userId: feedPost.userId })
      .from(feedPost)
      .where(eq(feedPost.id, Number(target.key)))
      .limit(1)
    if (post && post.userId === user.id) {
      throw new Error("You can't save your own post.")
    }
  }

  const existing = await db
    .select({ id: savedItem.id })
    .from(savedItem)
    .where(
      and(
        eq(savedItem.userId, user.id),
        eq(savedItem.itemType, target.type),
        eq(savedItem.itemKey, target.key),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    await db.delete(savedItem).where(eq(savedItem.id, existing[0].id))
    return { saved: false }
  }

  await db.insert(savedItem).values({
    userId: user.id,
    itemType: target.type,
    itemKey: target.key,
    title: target.title,
    subtitle: target.subtitle ?? null,
    url: target.url,
    image: target.image ?? null,
  })
  return { saved: true }
}

/** Re-shares a target to the current user's own status (story). */
export async function addTargetToStatus(target: ShareTarget): Promise<{ ok: true }> {
  await requireUser()
  if (target.image) {
    await createStatus({ mediaType: "image", mediaUrl: target.image, caption: target.title })
  } else {
    await createStatus({ mediaType: "text", caption: target.title, backgroundColor: "sunset" })
  }
  return { ok: true }
}
