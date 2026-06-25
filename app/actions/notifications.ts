"use server"

import { and, desc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { follow, notification } from "@/lib/db/schema"

export type NotificationType = "post" | "live" | "like" | "comment" | "follow" | "repost"

export type NotificationView = {
  id: number
  actorName: string
  type: NotificationType
  message: string
  link: string
  read: boolean
  postedAt: string
}

/** Creates a single notification for one recipient (skips self-notifications). */
export async function notifyUser(input: {
  userId: string
  actorId: string
  actorName: string
  type: NotificationType
  message: string
  link: string
}): Promise<void> {
  if (input.userId === input.actorId) return
  await db.insert(notification).values({
    userId: input.userId,
    actorId: input.actorId,
    actorName: input.actorName,
    type: input.type,
    message: input.message,
    link: input.link,
  })
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
}

/** Returns the current user's notifications (newest first), or null if signed out. */
export async function getNotifications(): Promise<NotificationView[] | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, session.user.id))
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
    .where(and(eq(notification.userId, session.user.id), eq(notification.read, false)))
  return rows.length
}

/** Marks all of the current user's notifications as read. */
export async function markNotificationsRead(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return
  await db
    .update(notification)
    .set({ read: true })
    .where(and(eq(notification.userId, session.user.id), eq(notification.read, false)))
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
