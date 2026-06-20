"use server"

import { and, desc, eq, gt, inArray, or } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { follow, statusUpdate, statusView, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { getOrCreateConversation, sendDirectMessage } from "@/app/actions/dm"

const STATUS_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours, WhatsApp-style

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

export type StatusItem = {
  id: number
  mediaUrl: string | null
  mediaType: "image" | "video" | "text"
  caption: string | null
  backgroundColor: string | null
  postedAt: string
  viewed: boolean // whether the signed-in viewer has already seen this item
}

export type StatusGroup = {
  userId: string
  authorName: string
  initials: string
  color: string
  authorImage: string | null
  isSelf: boolean
  isConnection: boolean
  allViewed: boolean // every item seen -> grey ring instead of gradient
  items: StatusItem[]
}

export type StatusViewer = {
  viewerId: string
  viewerName: string
  initials: string
  color: string
  reaction: string | null
  viewedAt: string
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

/**
 * Returns active (non-expired) statuses grouped by author. Ordering:
 * the signed-in user's own status first, then people they're connected to
 * (they follow OR are followed by), then everyone else. Within each author,
 * items run oldest -> newest for sequential viewing.
 */
export async function getStatusFeed(): Promise<StatusGroup[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  const now = new Date()
  const rows = await db
    .select()
    .from(statusUpdate)
    .where(gt(statusUpdate.expiresAt, now))
    .orderBy(desc(statusUpdate.createdAt))

  if (rows.length === 0) return []

  // Build the set of "connections": people the current user follows or who follow them.
  const connections = new Set<string>()
  if (currentUserId) {
    const rels = await db
      .select({ followerId: follow.followerId, followingId: follow.followingId })
      .from(follow)
      .where(or(eq(follow.followerId, currentUserId), eq(follow.followingId, currentUserId)))
    for (const r of rels) {
      if (r.followerId === currentUserId) connections.add(r.followingId)
      if (r.followingId === currentUserId) connections.add(r.followerId)
    }
  }

  const imageRows = await db
    .select({ id: userTable.id, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, [...new Set(rows.map((r) => r.userId))]))
  const imageMap = new Map(imageRows.map((r) => [r.id, r.image]))

  // Which of these statuses has the current user already viewed?
  const seen = new Set<number>()
  if (currentUserId) {
    const viewRows = await db
      .select({ statusId: statusView.statusId })
      .from(statusView)
      .where(
        and(
          eq(statusView.viewerId, currentUserId),
          inArray(
            statusView.statusId,
            rows.map((r) => r.id),
          ),
        ),
      )
    for (const v of viewRows) seen.add(v.statusId)
  }

  // Group by author, preserving most-recent-first author discovery.
  const groups = new Map<string, StatusGroup>()
  for (const r of rows) {
    let group = groups.get(r.userId)
    if (!group) {
      group = {
        userId: r.userId,
        authorName: r.authorName,
        initials: getInitials(r.authorName),
        color: getAvatarColor(r.userId),
        authorImage: imageMap.get(r.userId) ?? null,
        isSelf: currentUserId === r.userId,
        isConnection: connections.has(r.userId),
        allViewed: false,
        items: [],
      }
      groups.set(r.userId, group)
    }
    group.items.push({
      id: r.id,
      mediaUrl: r.mediaUrl,
      mediaType: r.mediaType === "video" ? "video" : r.mediaType === "text" ? "text" : "image",
      caption: r.caption,
      backgroundColor: r.backgroundColor,
      postedAt: timeAgo(r.createdAt),
      viewed: seen.has(r.id),
    })
  }

  // Items came in newest-first; flip to oldest-first per author, and compute the
  // "all viewed" flag that drives the grey (seen) vs gradient (new) ring.
  const list = [...groups.values()].map((g) => {
    const items = [...g.items].reverse()
    return { ...g, items, allViewed: items.every((i) => i.viewed) }
  })

  // Self first, then connections, then everyone else. Stable within each band
  // (already ordered by most recent status because of insertion order).
  function rank(g: StatusGroup) {
    if (g.isSelf) return 0
    if (g.isConnection) return 1
    return 2
  }
  return list.sort((a, b) => rank(a) - rank(b))
}

/**
 * Returns a single user's active status as a one-element group (or null when
 * they have no live status). Powers the story ring around a profile avatar.
 */
export async function getActiveStatusForUser(userId: string): Promise<StatusGroup | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  const now = new Date()
  const rows = await db
    .select()
    .from(statusUpdate)
    .where(and(eq(statusUpdate.userId, userId), gt(statusUpdate.expiresAt, now)))
    .orderBy(desc(statusUpdate.createdAt))

  if (rows.length === 0) return null

  const [imageRow] = await db
    .select({ image: userTable.image, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)

  const seen = new Set<number>()
  if (currentUserId) {
    const viewRows = await db
      .select({ statusId: statusView.statusId })
      .from(statusView)
      .where(
        and(
          eq(statusView.viewerId, currentUserId),
          inArray(
            statusView.statusId,
            rows.map((r) => r.id),
          ),
        ),
      )
    for (const v of viewRows) seen.add(v.statusId)
  }

  const items: StatusItem[] = [...rows]
    .reverse()
    .map((r) => ({
      id: r.id,
      mediaUrl: r.mediaUrl,
      mediaType: r.mediaType === "video" ? "video" : r.mediaType === "text" ? "text" : "image",
      caption: r.caption,
      backgroundColor: r.backgroundColor,
      postedAt: timeAgo(r.createdAt),
      viewed: seen.has(r.id),
    }))

  return {
    userId,
    authorName: imageRow?.name ?? rows[0].authorName,
    initials: getInitials(imageRow?.name ?? rows[0].authorName),
    color: getAvatarColor(userId),
    authorImage: imageRow?.image ?? null,
    isSelf: currentUserId === userId,
    isConnection: false,
    allViewed: items.every((i) => i.viewed),
    items,
  }
}

export async function createStatus(input: {
  mediaUrl?: string | null
  mediaType: "image" | "video" | "text"
  caption?: string | null
  backgroundColor?: string | null
}) {
  const user = await requireUser()

  if (input.mediaType === "text") {
    if (!input.caption?.trim()) throw new Error("Type something to share a text status.")
  } else if (!input.mediaUrl) {
    throw new Error("A photo or video is required.")
  }

  await db.insert(statusUpdate).values({
    userId: user.id,
    authorName: user.name,
    mediaUrl: input.mediaType === "text" ? null : input.mediaUrl,
    mediaType: input.mediaType,
    caption: input.caption?.trim() || null,
    backgroundColor: input.mediaType === "text" ? input.backgroundColor || "sunset" : null,
    expiresAt: new Date(Date.now() + STATUS_TTL_MS),
  })
  revalidatePath("/feed")
}

export async function deleteStatus(id: number) {
  const user = await requireUser()
  await db.delete(statusUpdate).where(and(eq(statusUpdate.id, id), eq(statusUpdate.userId, user.id)))
  await db.delete(statusView).where(eq(statusView.statusId, id))
  revalidatePath("/feed")
}

/**
 * Records that the signed-in user has viewed a status. Idempotent via the
 * unique (statusId, viewerId) index, so re-viewing is a no-op for ordering.
 */
export async function markStatusViewed(statusId: number) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return // anonymous views aren't tracked
  const user = session.user

  // Don't record the owner viewing their own status.
  const [row] = await db.select().from(statusUpdate).where(eq(statusUpdate.id, statusId)).limit(1)
  if (!row || row.userId === user.id) return

  await db
    .insert(statusView)
    .values({ statusId, viewerId: user.id, viewerName: user.name })
    .onConflictDoNothing()
}

/** Owner-only: the list of people who have viewed a given status. */
export async function getStatusViewers(statusId: number): Promise<StatusViewer[]> {
  const user = await requireUser()
  const [row] = await db.select().from(statusUpdate).where(eq(statusUpdate.id, statusId)).limit(1)
  if (!row || row.userId !== user.id) return []

  const rows = await db
    .select()
    .from(statusView)
    .where(eq(statusView.statusId, statusId))
    .orderBy(desc(statusView.createdAt))

  return rows.map((r) => ({
    viewerId: r.viewerId,
    viewerName: r.viewerName,
    initials: getInitials(r.viewerName),
    color: getAvatarColor(r.viewerId),
    reaction: r.reaction,
    viewedAt: timeAgo(r.createdAt),
  }))
}

/** Leaves/updates an emoji reaction on a status (recorded on the view row). */
export async function reactToStatus(statusId: number, emoji: string) {
  const user = await requireUser()
  await db
    .insert(statusView)
    .values({ statusId, viewerId: user.id, viewerName: user.name, reaction: emoji })
    .onConflictDoUpdate({
      target: [statusView.statusId, statusView.viewerId],
      set: { reaction: emoji },
    })
}

/**
 * Replies to a status by opening (or reusing) a DM with the author and sending
 * the message there — mirroring Instagram's "reply to story" behaviour.
 */
export async function replyToStatus(statusId: number, body: string) {
  const user = await requireUser()
  const text = body.trim()
  if (!text) throw new Error("Write a reply first.")

  const [row] = await db.select().from(statusUpdate).where(eq(statusUpdate.id, statusId)).limit(1)
  if (!row) throw new Error("That status no longer exists.")
  if (row.userId === user.id) throw new Error("You can't reply to your own status.")

  const conversationId = await getOrCreateConversation(row.userId)
  await sendDirectMessage({ conversationId, body: `↩️ Replied to your status: ${text}` })
}
