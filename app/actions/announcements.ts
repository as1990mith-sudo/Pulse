"use server"

import { and, asc, eq, gte } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { announcement } from "@/lib/db/schema"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

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
  isOwner: boolean
}

/**
 * Active promotional banners with an event date today or later, soonest first.
 * Visible to everyone (signed in or not).
 */
export async function getActiveAnnouncements(): Promise<AnnouncementView[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const currentUserId = session?.user?.id ?? null

  const today = new Date().toISOString().slice(0, 10)
  const rows = await db
    .select()
    .from(announcement)
    .where(and(eq(announcement.status, "active"), gte(announcement.eventDate, today)))
    .orderBy(asc(announcement.eventDate))

  return rows.map((a) => ({
    id: a.id,
    userId: a.userId,
    creatorName: a.creatorName,
    title: a.title,
    description: a.description,
    flyer: a.flyer,
    location: a.location,
    eventDate: a.eventDate,
    eventTime: a.eventTime,
    isOwner: currentUserId === a.userId,
  }))
}

/**
 * Submit a paid advertising request. Payment is simulated here — once the
 * creator confirms the placement fee, the banner is published as "active" and
 * becomes visible to all users.
 */
export async function createAnnouncement(input: {
  title: string
  description?: string | null
  flyer?: string | null
  location?: string | null
  eventDate: string
  eventTime?: string | null
}) {
  const user = await requireUser()

  const title = input.title.trim()
  if (!title) throw new Error("An event title is required.")
  if (!input.eventDate) throw new Error("An event date is required.")
  if (input.eventDate < new Date().toISOString().slice(0, 10)) {
    throw new Error("The event date must be today or in the future.")
  }

  await db.insert(announcement).values({
    userId: user.id,
    creatorName: user.name,
    title,
    description: input.description?.trim() || null,
    flyer: input.flyer?.trim() || null,
    location: input.location?.trim() || null,
    eventDate: input.eventDate,
    eventTime: input.eventTime?.trim() || null,
    status: "active",
  })

  revalidatePath("/feed")
}

/** Creators can remove their own banner. */
export async function deleteAnnouncement(id: number) {
  const user = await requireUser()
  await db.delete(announcement).where(and(eq(announcement.id, id), eq(announcement.userId, user.id)))
  revalidatePath("/feed")
}
