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
  status: string
  lastPostedAt: string
}

/**
 * Lists the Daily Devotionals owned by this Home only (scoped by homeId). A
 * Home never sees another organisation's — or Universal's — devotionals.
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
    status: r.status,
    lastPostedAt: r.lastPostedAt.toISOString(),
  }))
}

export type HomeDevotionalInput = {
  handle: string
  title: string
  verseRef: string
  verse: string
  body: string
  prayer?: string
  cover?: string | null
  readingMinutes?: number
}

/**
 * Publishes a new Daily Devotional to this Home. The row is stamped with the
 * Home id so it only ever appears inside this organisation's Home (spec §12) —
 * the admin controls exactly what devotional their members see.
 */
export async function publishHomeDevotional(input: HomeDevotionalInput) {
  const { homeId } = await requireContentManager(input.handle)
  const title = input.title.trim()
  const verseRef = input.verseRef.trim()
  const verse = input.verse.trim()
  const body = input.body.trim()
  if (!title || !verseRef || !verse || !body) {
    throw new Error("Title, reference, verse and body are all required.")
  }
  const now = new Date()
  await db.insert(devotional).values({
    title,
    verseRef,
    verse,
    body,
    prayer: input.prayer?.trim() || "",
    cover: input.cover?.trim() || null,
    readingMinutes: input.readingMinutes && input.readingMinutes > 0 ? input.readingMinutes : 3,
    publishDate: `home-${homeId.slice(0, 6)}-${now.getTime()}-${randomUUID().slice(0, 6)}`,
    status: "published",
    createdAt: now,
    lastPostedAt: now,
    homeId,
  })
  revalidatePath("/")
  revalidatePath(`/org/${input.handle}/admin/content`)
}

/** Re-posts an existing Home devotional to the top of the Home feed. */
export async function repostHomeDevotional(handle: string, id: number) {
  const { homeId } = await requireContentManager(handle)
  await db
    .update(devotional)
    .set({ status: "published", lastPostedAt: new Date() })
    .where(and(eq(devotional.id, id), eq(devotional.homeId, homeId)))
  revalidatePath("/")
  revalidatePath(`/org/${handle}/admin/content`)
}
