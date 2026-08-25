"use server"

import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { follow, home as home_, homeMembership, notification } from "@/lib/db/schema"
import { sendPushToUsers } from "@/lib/push"

export type NotificationType =
  | "post"
  | "live"
  | "like"
  | "comment"
  | "follow"
  | "repost"
  | "mention"
  | "announcement"

export type NotificationView = {
  id: number
  actorName: string
  type: NotificationType
  message: string
  link: string
  read: boolean
  postedAt: string
}

/**
 * Creates a single notification for one recipient (skips self-notifications).
 * Pass `homeId` to scope it to a Home inbox; omit for a Universal notification.
 */
export async function notifyUser(input: {
  userId: string
  actorId: string
  actorName: string
  type: NotificationType
  message: string
  link: string
  homeId?: string | null
}): Promise<void> {
  if (input.userId === input.actorId) return
  await db.insert(notification).values({
    userId: input.userId,
    actorId: input.actorId,
    actorName: input.actorName,
    type: input.type,
    message: input.message,
    link: input.link,
    homeId: input.homeId ?? null,
  })

  // Personal activity: the actor IS the subject, so they lead the title.
  await sendPushToUsers([input.userId], {
    title: `${input.actorName} ${pushVerb(input.type)}`,
    body: input.message,
    link: input.link,
    // Collapse repeat activity on the same target (three likes on one post
    // should not stack three notifications), but keep distinct targets apart.
    tag: `${input.type}:${input.link}`,
    type: input.type,
  })
}

/**
 * Short phrasing for the device notification. Separate from the in-app `verb()`
 * because a push title has no avatar or icon beside it to supply context, so it
 * has to read as a complete sentence on its own.
 */
function pushVerb(type: NotificationType): string {
  switch (type) {
    case "like":
      return "liked your post"
    case "comment":
      return "replied to you"
    case "live":
      return "is live now"
    case "post":
      return "posted"
    case "follow":
      return "started following you"
    case "repost":
      return "reposted you"
    case "mention":
      return "mentioned you"
    case "announcement":
      return "shared an announcement"
  }
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

/**
 * Creates a notification for every follower of `actor`. Used when the actor
 * posts a tweet or starts a live stream. Silently does nothing if no followers.
 */
export async function notifyFollowers(input: {
  actorId: string
  actorName: string
  type: "post" | "live"
  message: string
  link: string
}): Promise<void> {
  const followers = await db
    .select({ followerId: follow.followerId })
    .from(follow)
    .where(eq(follow.followingId, input.actorId))

  if (followers.length === 0) return

  await db.insert(notification).values(
    followers.map((f) => ({
      userId: f.followerId,
      actorId: input.actorId,
      actorName: input.actorName,
      type: input.type,
      message: input.message,
      link: input.link,
    })),
  )

  await sendPushToUsers(
    followers.map((f) => f.followerId),
    {
      title: `${input.actorName} ${pushVerb(input.type)}`,
      body: input.message,
      link: input.link,
      tag: `${input.type}:${input.link}`,
      type: input.type,
    },
  )
}

/** Returns the current user's notifications (newest first), or null if signed out. */
export async function getNotifications(): Promise<NotificationView[] | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const rows = await db
    .select()
    .from(notification)
    // Universal inbox only — Home-scoped notifications live in their Home inbox.
    .where(and(eq(notification.userId, session.user.id), isNull(notification.homeId)))
    .orderBy(desc(notification.createdAt))
    .limit(30)

  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    type: r.type as NotificationType,
    message: r.message,
    link: r.link,
    read: r.read,
    postedAt: timeAgo(r.createdAt),
  }))
}

/** Count of unread notifications for the badge. */
export async function getUnreadCount(): Promise<number> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return 0
  const rows = await db
    .select({ id: notification.id })
    .from(notification)
    .where(
      and(
        eq(notification.userId, session.user.id),
        eq(notification.read, false),
        isNull(notification.homeId),
      ),
    )
  return rows.length
}

/** Marks all of the current user's Universal notifications as read. */
export async function markNotificationsRead(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return
  await db
    .update(notification)
    .set({ read: true })
    .where(
      and(
        eq(notification.userId, session.user.id),
        eq(notification.read, false),
        isNull(notification.homeId),
      ),
    )
  revalidatePath("/")
}

/**
 * Permanently deletes one or more of the current user's notifications. Used by
 * swipe-to-delete and the press-and-hold multi-select "Clear" action. Scoped by
 * userId so a user can only ever delete their own rows.
 */
export async function deleteNotifications(ids: number[]): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return
  if (ids.length === 0) return
  await db
    .delete(notification)
    .where(and(eq(notification.userId, session.user.id), inArray(notification.id, ids)))
  revalidatePath("/")
}

// ── Home-scoped notifications ─────────────────────────────────────────────────
// Everything below powers a Home's own notification inbox. Home notifications
// carry a `homeId` so they are strictly isolated: they never appear in the
// Universal list/count above, and a Home inbox never shows Universal activity.

/** The user ids of every ACTIVE member of a Home (optionally excluding one). */
async function activeMemberIds(homeId: string, exceptUserId?: string): Promise<string[]> {
  const rows = await db
    .select({ userId: homeMembership.userId })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.status, "active")))
  return rows.map((r) => r.userId).filter((id) => id !== exceptUserId)
}

/**
 * Fans a notification out to every active member of a Home (except the actor).
 * Used for organisation-wide activity — a new organisation post/announcement or
 * a new Community Help thread. One insert per recipient keeps read-state and
 * delete-state per user, matching the Universal model.
 */
export async function notifyHomeMembers(input: {
  homeId: string
  actorId: string
  actorName: string
  type: NotificationType
  message: string
  link: string
  /** Overrides the device notification body; defaults to `message`. */
  pushBody?: string
  /**
   * Overrides the device collapse key. Callers representing a distinct,
   * concurrently-possible event (a live session) MUST pass a unique value, or
   * the OS will replace the previous notification instead of adding to it.
   */
  pushTag?: string
}): Promise<void> {
  const recipients = await activeMemberIds(input.homeId, input.actorId)
  if (recipients.length === 0) return
  await db.insert(notification).values(
    recipients.map((userId) => ({
      userId,
      actorId: input.actorId,
      actorName: input.actorName,
      type: input.type,
      message: input.message,
      link: input.link,
      homeId: input.homeId,
    })),
  )

  // Home-scoped events are attributed to the HOME, not to the admin who
  // happened to trigger them: a member should read "Kingdom Academy is live",
  // never "Sarah is live". The actor is demoted to the body, which is also what
  // keeps two admins' concurrent events distinguishable.
  const [home] = await db
    .select({ name: home_.name })
    .from(home_)
    .where(eq(home_.id, input.homeId))
    .limit(1)
  const homeName = home?.name ?? "Your Home"

  await sendPushToUsers(recipients, {
    title: input.type === "live" ? `${homeName} is live` : `${homeName} · ${pushVerb(input.type)}`,
    body: input.pushBody ?? input.message,
    link: input.link,
    // Defaults to the link, which collapses repeats of the same Home post.
    // Live passes an explicit per-session tag so two simultaneous lives from
    // one Home survive as two notifications.
    tag: input.pushTag ?? `${input.type}:${input.homeId}:${input.link}`,
    type: input.type,
    homeName,
  })
}

/** Tells a Home's members that a private session just went live (member-gated). */
export async function notifyHomeLive(input: {
  homeId: string
  actorId: string
  actorName: string
  title: string
  roomName: string
}): Promise<void> {
  await notifyHomeMembers({
    homeId: input.homeId,
    actorId: input.actorId,
    actorName: input.actorName,
    type: "live",
    message: input.title,
    link: `/live/${input.roomName}`,
    // Name the host in the body so two concurrent lives from the same Home are
    // told apart at a glance ("Andrew · Morning Prayer" vs "Sarah · Bible
    // Study") while the title still belongs to the Home.
    pushBody: `${input.actorName} · ${input.title}`,
    // The room name is the live session's identity, so this is what keeps
    // simultaneous sessions from collapsing into one notification.
    pushTag: `live:${input.roomName}`,
  })
}

/** Newest-first notifications for the current user WITHIN a specific Home. */
export async function getHomeNotifications(homeId: string): Promise<NotificationView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return []
  const rows = await db
    .select()
    .from(notification)
    .where(and(eq(notification.userId, session.user.id), eq(notification.homeId, homeId)))
    .orderBy(desc(notification.createdAt))
    .limit(30)

  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    type: r.type as NotificationType,
    message: r.message,
    link: r.link,
    read: r.read,
    postedAt: timeAgo(r.createdAt),
  }))
}

/** Unread count for the current user WITHIN a specific Home (for the Home bell). */
export async function getHomeUnreadNotificationCount(homeId: string): Promise<number> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return 0
  const rows = await db
    .select({ id: notification.id })
    .from(notification)
    .where(
      and(
        eq(notification.userId, session.user.id),
        eq(notification.homeId, homeId),
        eq(notification.read, false),
      ),
    )
  return rows.length
}

/** Marks all of the current user's notifications WITHIN a Home as read. */
export async function markHomeNotificationsRead(homeId: string): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return
  await db
    .update(notification)
    .set({ read: true })
    .where(
      and(
        eq(notification.userId, session.user.id),
        eq(notification.homeId, homeId),
        eq(notification.read, false),
      ),
    )
}

/** Deletes the current user's own notifications WITHIN a Home. */
export async function deleteHomeNotifications(homeId: string, ids: number[]): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return
  if (ids.length === 0) return
  await db
    .delete(notification)
    .where(
      and(
        eq(notification.userId, session.user.id),
        eq(notification.homeId, homeId),
        inArray(notification.id, ids),
      ),
    )
}
