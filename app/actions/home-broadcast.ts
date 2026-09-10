"use server"

import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  homeBroadcast,
  homeBroadcastRecipient,
  homeMembership,
  organization,
  user as userTable,
} from "@/lib/db/schema"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import {
  getViewerBroadcastSummary,
  getViewerBroadcastThread,
  markViewerBroadcastsOpened,
} from "@/lib/home/broadcast-read"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import { normalizeGender } from "@/lib/home/members"
import {
  recipientTypeLabel,
  type BroadcastAudience,
  type BroadcastMemberPick,
  type BroadcastMessageView,
  type BroadcastRecipientType,
  type BroadcastView,
} from "@/lib/home/broadcast"
import { getCurrentUser } from "@/lib/session"
import { getInitials, getAvatarColor } from "@/lib/identity"
import { sendPushToUsers } from "@/lib/push"
import type { HomeView } from "@/lib/home/types"

/**
 * Gate: the viewer must be an active member of `handle`'s Home AND hold
 * `notifications.send` there — the same permission that lets admins push Home
 * notifications. Owners/administrators/content managers qualify; plain members
 * and leaders do not. Everything here is resolved server-side, so a client can
 * never forge the Home id or the audience.
 */
async function requireBroadcaster(handle: string): Promise<{ home: HomeView; userId: string; actorName: string }> {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")

  const membership = await getViewerMembership(home.id)
  if (membership?.status !== "active" || !homeRoleHasPermission(membership.role as HomeRole, "notifications.send")) {
    throw new Error("You do not have permission to broadcast in this Home.")
  }

  return { home, userId: user.id, actorName: user.name }
}

/** Active members of the Home, with gender counts — powers the compose preview. */
async function loadActiveMembers(homeId: string): Promise<BroadcastMemberPick[]> {
  const rows = await db
    .select({
      userId: homeMembership.userId,
      name: userTable.name,
      image: userTable.image,
      gender: userTable.gender,
    })
    .from(homeMembership)
    .innerJoin(userTable, eq(userTable.id, homeMembership.userId))
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.status, "active")))

  return rows
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      gender: normalizeGender(r.gender),
      image: r.image,
      initials: getInitials(r.name),
      color: getAvatarColor(r.userId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The active-member audience + gender breakdown for the composer. */
export async function getBroadcastAudience(handle: string): Promise<BroadcastAudience> {
  const { home } = await requireBroadcaster(handle)
  const members = await loadActiveMembers(home.id)
  return {
    total: members.length,
    male: members.filter((m) => m.gender === "male").length,
    female: members.filter((m) => m.gender === "female").length,
    other: members.filter((m) => m.gender === "other").length,
    unknownGender: members.filter((m) => m.gender === null).length,
    members,
  }
}

export type CreateBroadcastInput = {
  message: string
  recipientType: BroadcastRecipientType
  /** Member ids for "exclude" / "specific" targeting; ignored otherwise. */
  memberIds?: string[]
}

/**
 * Resolves the audience to a concrete set of member ids at THIS moment and
 * stores one recipient row per person — a permanent snapshot. A member who
 * joins or leaves later never changes this broadcast's reach.
 */
function resolveRecipients(members: BroadcastMemberPick[], type: BroadcastRecipientType, picked: string[]): string[] {
  const memberIds = new Set(members.map((m) => m.userId))
  const validPicked = picked.filter((id) => memberIds.has(id))
  switch (type) {
    case "all":
      return members.map((m) => m.userId)
    case "female":
      return members.filter((m) => m.gender === "female").map((m) => m.userId)
    case "male":
      return members.filter((m) => m.gender === "male").map((m) => m.userId)
    case "exclude": {
      const excluded = new Set(validPicked)
      return members.filter((m) => !excluded.has(m.userId)).map((m) => m.userId)
    }
    case "specific":
      return validPicked
    default:
      return []
  }
}

/** Creates and immediately delivers a broadcast to a snapshotted audience. */
export async function createBroadcast(
  handle: string,
  input: CreateBroadcastInput,
): Promise<{ id: number; recipientCount: number }> {
  const { home, userId } = await requireBroadcaster(handle)

  const message = input.message.trim()
  if (!message) throw new Error("Write a message before sending.")
  if (message.length > 4000) throw new Error("That message is too long.")

  const members = await loadActiveMembers(home.id)
  const recipientIds = resolveRecipients(members, input.recipientType, input.memberIds ?? [])
  if (recipientIds.length === 0) throw new Error("No members match this audience.")

  const now = new Date()

  const [created] = await db
    .insert(homeBroadcast)
    .values({
      homeId: home.id,
      createdBy: userId,
      message,
      recipientType: input.recipientType,
      recipientCount: recipientIds.length,
      status: "sent",
      createdAt: now,
      sentAt: now,
    })
    .returning({ id: homeBroadcast.id })

  await db.insert(homeBroadcastRecipient).values(
    recipientIds.map((rid) => ({
      broadcastId: created.id,
      homeId: home.id,
      userId: rid,
      sentAt: now,
      status: "sent" as const,
    })),
  )

  // Fire-and-forget push: the inbox row is the source of truth, so a push
  // service being down must never fail the send.
  void sendPushToUsers(recipientIds, {
    title: home.orgName,
    body: message.length > 140 ? `${message.slice(0, 139)}…` : message,
    link: "/messages/home-broadcast",
    tag: `home-broadcast-${created.id}`,
    type: "broadcast",
    homeName: home.orgName,
  })

  revalidatePath(`/org/${handle}/admin/broadcast`)
  revalidatePath("/messages")
  return { id: created.id, recipientCount: recipientIds.length }
}

/** The admin's broadcast history for a Home, newest first, with open analytics. */
export async function getBroadcasts(handle: string): Promise<BroadcastView[]> {
  const { home } = await requireBroadcaster(handle)

  const broadcasts = await db
    .select({
      id: homeBroadcast.id,
      message: homeBroadcast.message,
      recipientType: homeBroadcast.recipientType,
      recipientCount: homeBroadcast.recipientCount,
      sentAt: homeBroadcast.sentAt,
      createdByName: userTable.name,
    })
    .from(homeBroadcast)
    .innerJoin(userTable, eq(userTable.id, homeBroadcast.createdBy))
    .where(eq(homeBroadcast.homeId, home.id))
    .orderBy(desc(homeBroadcast.sentAt))

  if (broadcasts.length === 0) return []

  const ids = broadcasts.map((b) => b.id)
  const agg = await db
    .select({
      broadcastId: homeBroadcastRecipient.broadcastId,
      total: sql<number>`count(*)::int`,
      opened: sql<number>`count(${homeBroadcastRecipient.openedAt})::int`,
    })
    .from(homeBroadcastRecipient)
    .where(inArray(homeBroadcastRecipient.broadcastId, ids))
    .groupBy(homeBroadcastRecipient.broadcastId)

  const openedById = new Map(agg.map((a) => [a.broadcastId, a.opened]))

  return broadcasts.map((b) => {
    const opened = openedById.get(b.id) ?? 0
    return {
      id: b.id,
      message: b.message,
      recipientType: b.recipientType as BroadcastRecipientType,
      recipientLabel: recipientTypeLabel(b.recipientType as BroadcastRecipientType),
      recipientCount: b.recipientCount,
      openedCount: opened,
      unopenedCount: Math.max(0, b.recipientCount - opened),
      sentAt: b.sentAt.toISOString(),
      createdByName: b.createdByName,
    }
  })
}

/**
 * One inbox row per Home the viewer belongs to that has ever broadcast to them —
 * the "Home Broadcast" conversations. The sender identity is always the Home
 * (logo, name), never the admin who composed it. Unread rows carry `unreadCount`
 * so the inbox can pin them above ordinary chats until opened. Home-scoped
 * server-side: a member only ever sees Homes they are an active member of.
 */
export type BroadcastInboxItem = {
  homeId: string
  homeName: string
  image: string | null
  initials: string
  color: string
  lastMessage: string
  lastSentAt: string // ISO
  unreadCount: number
}

export async function getMyBroadcastInboxItems(): Promise<BroadcastInboxItem[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const memberships = await db
    .select({ homeId: homeMembership.homeId })
    .from(homeMembership)
    .where(and(eq(homeMembership.userId, user.id), eq(homeMembership.status, "active")))

  if (memberships.length === 0) return []

  const homeIds = memberships.map((m) => m.homeId)
  const orgs = await db
    .select({ id: organization.id, name: organization.name, logo: organization.logo })
    .from(organization)
    .where(inArray(organization.id, homeIds))
  const orgById = new Map(orgs.map((o) => [o.id, o]))

  const items: BroadcastInboxItem[] = []
  for (const { homeId } of memberships) {
    const org = orgById.get(homeId)
    if (!org) continue
    const summary = await getViewerBroadcastSummary(homeId, user.id)
    if (!summary) continue
    items.push({
      homeId,
      homeName: org.name,
      image: org.logo,
      initials: getInitials(org.name),
      color: getAvatarColor(org.id),
      lastMessage: summary.lastMessage,
      lastSentAt: summary.lastSentAt.toISOString(),
      unreadCount: summary.unreadCount,
    })
  }

  // Newest broadcast first; the inbox itself pins unread ones above all chats.
  items.sort((a, b) => new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime())
  return items
}

export type BroadcastThread = {
  homeId: string
  homeName: string
  image: string | null
  initials: string
  color: string
  messages: BroadcastMessageView[]
}

/**
 * The member-facing Home Broadcast thread for one Home. Resolves the viewer's
 * active membership server-side — a non-member (or a client forging a homeId)
 * gets null, never another Home's broadcasts.
 */
export async function getBroadcastThread(homeId: string): Promise<BroadcastThread | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const [membership] = await db
    .select({ id: homeMembership.id })
    .from(homeMembership)
    .where(
      and(
        eq(homeMembership.userId, user.id),
        eq(homeMembership.homeId, homeId),
        eq(homeMembership.status, "active"),
      ),
    )
    .limit(1)
  if (!membership) return null

  const [org] = await db
    .select({ id: organization.id, name: organization.name, logo: organization.logo })
    .from(organization)
    .where(eq(organization.id, homeId))
    .limit(1)
  if (!org) return null

  const messages = await getViewerBroadcastThread(homeId, user.id)
  if (messages.length === 0) return null

  return {
    homeId,
    homeName: org.name,
    image: org.logo,
    initials: getInitials(org.name),
    color: getAvatarColor(org.id),
    messages,
  }
}

/**
 * Clears the viewer's unread Home Broadcasts for one Home — called when the
 * member opens the thread. Membership is re-checked so the mutation can't be
 * aimed at a Home the viewer doesn't belong to.
 */
export async function markBroadcastThreadOpened(homeId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const [membership] = await db
    .select({ id: homeMembership.id })
    .from(homeMembership)
    .where(
      and(
        eq(homeMembership.userId, user.id),
        eq(homeMembership.homeId, homeId),
        eq(homeMembership.status, "active"),
      ),
    )
    .limit(1)
  if (!membership) return

  await markViewerBroadcastsOpened(homeId, user.id)
  revalidatePath("/messages")
}
