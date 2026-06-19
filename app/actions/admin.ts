"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { devotional, episode } from "@/lib/db/schema"
import { getAdminUser, requireAdmin } from "@/lib/admin"

/** Lightweight check used by the header to decide whether to show the admin link. */
export async function checkIsAdmin(): Promise<boolean> {
  return (await getAdminUser()) !== null
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export type ActionResult = { ok: true } | { ok: false; error: string }

// --- Devotionals -----------------------------------------------------------

export async function createDevotional(input: {
  title: string
  verseRef: string
  verse: string
  body: string
  prayer: string
  cover: string | null
  readingMinutes: number
  publishDate: string
}): Promise<ActionResult> {
  await requireAdmin()

  const title = input.title.trim()
  const verseRef = input.verseRef.trim()
  const verse = input.verse.trim()
  const body = input.body.trim()
  const prayer = input.prayer.trim()
  const publishDate = input.publishDate.trim()

  if (!title || !verseRef || !verse || !body || !prayer || !publishDate) {
    return { ok: false, error: "Please fill in every field." }
  }

  await db.insert(devotional).values({
    title,
    verseRef,
    verse,
    body,
    prayer,
    cover: input.cover,
    readingMinutes: Math.max(1, Math.min(60, Math.round(input.readingMinutes) || 3)),
    publishDate,
  })

  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true }
}

export async function deleteDevotional(id: number): Promise<ActionResult> {
  await requireAdmin()
  await db.delete(devotional).where(eq(devotional.id, id))
  revalidatePath("/")
  revalidatePath("/admin")
  return { ok: true }
}

// --- Episodes --------------------------------------------------------------

export async function createEpisode(input: {
  title: string
  tagline: string
  category: string
  hostName: string
  duration: string
  cover: string | null
  description: string
}): Promise<ActionResult> {
  await requireAdmin()

  const title = input.title.trim()
  const tagline = input.tagline.trim()
  const category = input.category.trim()
  const hostName = input.hostName.trim()
  const description = input.description.trim()

  if (!title || !tagline || !category || !hostName || !description) {
    return { ok: false, error: "Please fill in every field except duration." }
  }

  // Build a unique slug from the title.
  const base = slugify(title) || "episode"
  let slug = base
  let n = 2
  while ((await db.select({ id: episode.id }).from(episode).where(eq(episode.slug, slug))).length > 0) {
    slug = `${base}-${n++}`
  }

  await db.insert(episode).values({
    slug,
    title,
    tagline,
    category,
    hostName,
    duration: input.duration.trim() || null,
    cover: input.cover,
    description,
  })

  revalidatePath("/catalog")
  revalidatePath("/admin")
  return { ok: true }
}

export async function deleteEpisode(id: number): Promise<ActionResult> {
  await requireAdmin()
  await db.delete(episode).where(eq(episode.id, id))
  revalidatePath("/catalog")
  revalidatePath("/admin")
  return { ok: true }
}
