"use server"

import { and, desc, eq, gt, inArray, or } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { follow, statusUpdate, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"

const STATUS_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours, WhatsApp-style

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

export type StatusItem = {
  id: number
  mediaUrl: string
  mediaType: "image" | "video"
  caption: string | null
  postedAt: string
}

export type StatusGroup = {
  userId: string
  authorName: string
  initials: string
  color: string
  authorImage: string | null
  isSelf: boolean
  isConnection: boolean
  items: StatusItem[]
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
        items: [],
      }
      groups.set(r.userId, group)
    }
    group.items.push({
      id: r.id,
      mediaUrl: r.mediaUrl,
      mediaType: r.mediaType === "video" ? "video" : "image",
      caption: r.caption,
      postedAt: timeAgo(r.createdAt),
    })
  }

  // Items came in newest-first; flip to oldest-first per author.
  const list = [...groups.values()].map((g) => ({ ...g, items: [...g.items].reverse() }))

  // Self first, then connections, then everyone else. Stable within each band
  // (already ordered by most recent status because of insertion order).
  function rank(g: StatusGroup) {
    if (g.isSelf) return 0
    if (g.isConnection) return 1
    return 2
  }
  return list.sort((a, b) => rank(a) - rank(b))
}

export async function createStatus(input: {
  mediaUrl: string
  mediaType: "image" | "video"
  caption?: string | null
}) {
  const user = await requireUser()
  if (!input.mediaUrl) throw new Error("A photo or video is required.")

  await db.insert(statusUpdate).values({
    userId: user.id,
    authorName: user.name,
    mediaUrl: input.mediaUrl,
    mediaType: input.mediaType === "video" ? "video" : "image",
    caption: input.caption?.trim() || null,
    expiresAt: new Date(Date.now() + STATUS_TTL_MS),
  })
  revalidatePath("/feed")
}

export async function deleteStatus(id: number) {
  const user = await requireUser()
  await db.delete(statusUpdate).where(and(eq(statusUpdate.id, id), eq(statusUpdate.userId, user.id)))
  revalidatePath("/feed")
}
