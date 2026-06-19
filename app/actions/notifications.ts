"use server"

import { and, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { follow, notification } from "@/lib/db/schema"

export type NotificationView = {
  id: number
  actorName: string
  type: "post" | "live"
  message: string
  link: string
  read: boolean
  postedAt: string
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
    type: r.type as "post" | "live",
    message: r.message,
    link: r.link,
    read: r.read,
    postedAt: timeAgo(r.createdAt),
  }))
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
