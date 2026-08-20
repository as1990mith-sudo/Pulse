"use server"

import { randomUUID } from "crypto"
import { and, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { devotional } from "@/lib/db/schema"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { homeRoleHasPermission } from "@/lib/home/roles"

async function requireContentManager(handle: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, "content.manage")) {
    throw new Error("You don't have permission to manage this Home's content.")
  }
  return { user: session.user, homeId: home.id, handle }
}

export type HomeDevotionalRow = {
  id: number
  title: string
  verseRef: string
  verse: string
  body: string
  prayer: string
  cover: string | null
  status: string
  scheduledFor: string | null
  lastPostedAt: string
}

/**
 * Lists the Daily Devotionals owned by this Home only (scoped by homeId). A
 * Home never sees another organisation's — or Universal's — devotionals. Every
 * editable field is returned so the admin can load a row straight back into the
 * composer to edit it.
 */
export async function getHomeDevotionals(handle: string): Promise<HomeDevotionalRow[]> {
  const { homeId } = await requireContentManager(handle)
  const rows = await db
    .select()
    .from(devotional)
    .where(eq(devotional.homeId, homeId))
    .orderBy(desc(devotional.lastPostedAt))
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    verseRef: r.verseRef,
    verse: r.verse,
    body: r.body,
    prayer: r.prayer,
    cover: r.cover,
    status: r.status,
    scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString() : null,
    lastPostedAt: r.lastPostedAt.toISOString(),
  }))
}

export type HomeDevotionalStatus = "draft" | "scheduled" | "published"

export type HomeDevotionalInput = {
  handle: string
  // When present, updates that existing devotional instead of creating a new one.
  id?: number
  title: string
  verseRef: string
  verse: string
  body: string
  prayer?: string
  cover?: string | null
  readingMinutes?: number
  // Lifecycle target. "draft" keeps it private, "scheduled" publishes it at
  // scheduledFor, "published" makes it live now. Defaults to "published".
  status?: HomeDevotionalStatus
  // Required (and must be in the future) when status is "scheduled". ISO string.
  scheduledFor?: string | null
}

/**
 * Creates or updates a Daily Devotional for this Home, at any point in its
 * lifecycle — draft, scheduled, or published. The row is stamped with the Home
 * id so it only ever appears inside this organisation's Home (spec §12), and
 * only published rows (or scheduled rows whose time has arrived) are shown to
 * members — drafts and future-scheduled rows stay hidden (see getLatestDevotional).
 */
export async function saveHomeDevotional(input: HomeDevotionalInput) {
  const { homeId } = await requireContentManager(input.handle)
  const title = input.title.trim()
  const verseRef = input.verseRef.trim()
  const verse = input.verse.trim()
  const body = input.body.trim()
  if (!title || !verseRef || !verse || !body) {
    throw new Error("Title, reference, verse and body are all required.")
  }

  const status: HomeDevotionalStatus = input.status ?? "published"
  let scheduledFor: Date | null = null
  if (status === "scheduled") {
    if (!input.scheduledFor) throw new Error("Pick a date and time to schedule this devotional.")
    scheduledFor = new Date(input.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime())) throw new Error("That schedule date isn't valid.")
    if (scheduledFor.getTime() <= Date.now()) throw new Error("Scheduled time must be in the future.")
  }

  const now = new Date()
  const fields = {
    title,
    verseRef,
    verse,
    body,
    prayer: input.prayer?.trim() || "",
    cover: input.cover?.trim() || null,
    readingMinutes: input.readingMinutes && input.readingMinutes > 0 ? input.readingMinutes : 3,
    status,
    scheduledFor,
  }

  if (input.id != null) {
    // Editing an existing row. Only bump lastPostedAt (which controls feed
    // ordering) when it's going live now, so editing a draft doesn't jump it
    // ahead of live devotionals.
    await db
      .update(devotional)
      .set(status === "published" ? { ...fields, lastPostedAt: now } : fields)
      .where(and(eq(devotional.id, input.id), eq(devotional.homeId, homeId)))
  } else {
    await db.insert(devotional).values({
      ...fields,
      publishDate: `home-${homeId.slice(0, 6)}-${now.getTime()}-${randomUUID().slice(0, 6)}`,
      createdAt: now,
      lastPostedAt: now,
      homeId,
    })
  }
  revalidatePath("/")
  revalidatePath(`/org/${input.handle}/admin/content`)
}

/** Permanently deletes a Home devotional (scoped so only this Home's rows go). */
export async function deleteHomeDevotional(handle: string, id: number) {
  const { homeId } = await requireContentManager(handle)
  await db.delete(devotional).where(and(eq(devotional.id, id), eq(devotional.homeId, homeId)))
  revalidatePath("/")
  revalidatePath(`/org/${handle}/admin/content`)
}

/** Re-posts an existing Home devotional to the top of the Home feed. */
export async function repostHomeDevotional(handle: string, id: number) {
  const { homeId } = await requireContentManager(handle)
  await db
    .update(devotional)
    .set({ status: "published", scheduledFor: null, lastPostedAt: new Date() })
    .where(and(eq(devotional.id, id), eq(devotional.homeId, homeId)))
  revalidatePath("/")
  revalidatePath(`/org/${handle}/admin/content`)
}
