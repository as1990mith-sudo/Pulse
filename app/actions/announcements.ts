"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, gt, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { AD_MAX_HOURS, AD_BLOCK_HOURS } from "@/lib/ads"

export type AnnouncementView = {
  id: number
  userId: string
  creatorName: string
  title: string
  description: string | null
  flyer: string | null
  location: string | null
  eventDate: string
  eventTime: string | null
  durationHours: number
  status: "pending" | "approved" | "declined"
  declineReason: string | null
  expiresAt: string | null
  isOwner: boolean
}

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")
  return user
}

/** Lazily flip approved ads to expired once their paid window has elapsed. */
async function expireDueAnnouncements() {
  await db
    .update(announcement)
    .set({ status: "declined", declineReason: "Expired" })
    .where(and(eq(announcement.status, "approved"), lte(announcement.expiresAt, new Date())))
}

function toView(row: typeof announcement.$inferSelect, currentUserId: string | null): AnnouncementView {
  return {
    id: row.id,
    userId: row.userId,
    creatorName: row.creatorName,
    title: row.title,
    description: row.description,
    flyer: row.flyer,
    location: row.location,
    eventDate: row.eventDate,
    eventTime: row.eventTime,
    durationHours: row.durationHours,
    status: row.status as AnnouncementView["status"],
    declineReason: row.declineReason,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isOwner: currentUserId === row.userId,
  }
}

/** Active (approved, not yet expired) banners shown to everyone on the feed. */
export async function getActiveAnnouncements(): Promise<AnnouncementView[]> {
  await expireDueAnnouncements()
  const user = await getCurrentUser()
  const rows = await db
    .select()
    .from(announcement)
    .where(and(eq(announcement.status, "approved"), gt(announcement.expiresAt, new Date())))
    .orderBy(asc(announcement.eventDate))
  return rows.map((r) => toView(r, user?.id ?? null))
}

/** The signed-in user's own requests, so they can track pending/declined status. */
export async function getMyAnnouncements(): Promise<AnnouncementView[]> {
  const user = await getCurrentUser()
  if (!user) return []
  await expireDueAnnouncements()
  const rows = await db
    .select()
    .from(announcement)
    .where(eq(announcement.userId, user.id))
    .orderBy(desc(announcement.createdAt))
  return rows.map((r) => toView(r, user.id))
}

export async function createAnnouncement(input: {
  title: string
  description?: string | null
  flyer?: string | null
  location?: string | null
  eventDate: string
  eventTime?: string | null
  durationHours: number
}): Promise<{ status: "approved" | "declined"; declineReason?: string }> {
  const user = await requireUser()
  const title = input.title.trim()
  if (!title) throw new Error("Event title is required.")
  if (!input.eventDate) throw new Error("Event date is required.")
  if (input.eventDate < new Date().toISOString().slice(0, 10)) {
    throw new Error("The event date must be today or in the future.")
  }

  const hours = Math.min(AD_MAX_HOURS, Math.max(AD_BLOCK_HOURS, input.durationHours))

  // Auto-approval, first-come-first-served: if an approved ad already holds this
  // date, decline the new request. Otherwise approve and publish immediately.
  const [taken] = await db
    .select({ id: announcement.id })
    .from(announcement)
    .where(and(eq(announcement.eventDate, input.eventDate), eq(announcement.status, "approved")))
    .limit(1)

  const approved = !taken
  const now = new Date()
  const expiresAt = approved ? new Date(now.getTime() + hours * 60 * 60 * 1000) : null
  const declineReason = approved ? null : "Declined due to high demand for the selected date."

  await db.insert(announcement).values({
    userId: user.id,
    creatorName: user.name,
    title,
    description: input.description?.trim() || null,
    flyer: input.flyer || null,
    location: input.location?.trim() || null,
    eventDate: input.eventDate,
    eventTime: input.eventTime || null,
    durationHours: hours,
    status: approved ? "approved" : "declined",
    declineReason,
    publishedAt: approved ? now : null,
    expiresAt,
  })

  revalidatePath("/feed")
  return approved ? { status: "approved" } : { status: "declined", declineReason: declineReason! }
}

/**
 * Remove a request. Allowed only while it is NOT a live approved ad. Approved
 * ads cannot be deleted or edited — they auto-disappear when the paid duration
 * elapses.
 */
export async function deleteAnnouncement(id: number) {
  const user = await requireUser()
  const [row] = await db.select().from(announcement).where(eq(announcement.id, id))
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only remove your own adverts.")
  if (row.status === "approved" && row.expiresAt && row.expiresAt > new Date()) {
    throw new Error("Approved adverts cannot be removed. They disappear automatically when the duration is due.")
  }
  await db.delete(announcement).where(and(eq(announcement.id, id), eq(announcement.userId, user.id)))
  revalidatePath("/feed")
}
