"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { devotional } from "@/lib/db/schema"
import { requirePermission } from "@/lib/admin-auth"
import { logAudit } from "@/lib/audit"
import {
  getDevotionalAnalytics,
  listDevotionals,
  type DevotionalStatus,
} from "@/lib/admin/devotionals"

export type DevotionalInput = {
  title: string
  verseRef: string
  verse: string
  body: string
  prayer: string
  cover?: string | null
  readingMinutes?: number
}

function revalidate() {
  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/admin/content/devotionals")
  revalidatePath("/devotional")
}

/** Read wrappers (permission-gated) used by the client. */
export async function fetchDevotionals(status: DevotionalStatus | "all", page = 0) {
  await requirePermission("devotionals.manage")
  return listDevotionals(status, page)
}

export async function fetchDevotionalAnalytics() {
  await requirePermission("devotionals.manage")
  return getDevotionalAnalytics()
}

function normalize(input: DevotionalInput) {
  const title = input.title.trim()
  const verseRef = input.verseRef.trim()
  const verse = input.verse.trim()
  const body = input.body.trim()
  const prayer = input.prayer.trim()
  if (!title || !verseRef || !verse || !body) {
    throw new Error("Title, reference, verse and body are required")
  }
  return {
    title,
    verseRef,
    verse,
    body,
    prayer,
    cover: input.cover?.trim() || null,
    readingMinutes: input.readingMinutes && input.readingMinutes > 0 ? input.readingMinutes : 3,
  }
}

/**
 * Creates a devotional in a specific lifecycle state.
 * - "published" makes it live immediately (bumps lastPostedAt so it shows on home).
 * - "scheduled" requires scheduledFor; it goes live automatically once due.
 * - "draft" is hidden until published.
 */
export async function createDevotional(
  input: DevotionalInput,
  target: { status: DevotionalStatus; scheduledFor?: string | null },
) {
  const actor = await requirePermission("devotionals.manage")
  const data = normalize(input)

  let scheduledFor: Date | null = null
  if (target.status === "scheduled") {
    if (!target.scheduledFor) throw new Error("A schedule date is required")
    scheduledFor = new Date(target.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime())) throw new Error("Invalid schedule date")
  }

  const now = new Date()
  const [row] = await db
    .insert(devotional)
    .values({
      ...data,
      publishDate: `dev-${now.getTime()}-${randomUUID().slice(0, 8)}`,
      status: target.status,
      scheduledFor,
      createdAt: now,
      // Published rows should sort to the top immediately; others sort by creation.
      lastPostedAt: target.status === "published" ? now : now,
    })
    .returning({ id: devotional.id })

  await logAudit({
    adminId: actor.userId,
    action: "devotional.create",
    targetType: "devotional",
    targetId: String(row.id),
    metadata: { title: data.title, status: target.status },
  })
  revalidate()
  return { id: row.id }
}

/** Edits the content of an existing devotional (does not change lifecycle). */
export async function updateDevotional(id: number, input: DevotionalInput) {
  const actor = await requirePermission("devotionals.manage")
  const data = normalize(input)
  await db.update(devotional).set(data).where(eq(devotional.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "devotional.update",
    targetType: "devotional",
    targetId: String(id),
    metadata: { title: data.title },
  })
  revalidate()
  return { ok: true }
}

/** Publishes a draft/scheduled/archived devotional now (also makes it the live one). */
export async function publishDevotional(id: number) {
  const actor = await requirePermission("devotionals.manage")
  await db
    .update(devotional)
    .set({ status: "published", scheduledFor: null, lastPostedAt: new Date() })
    .where(eq(devotional.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "devotional.publish",
    targetType: "devotional",
    targetId: String(id),
  })
  revalidate()
  return { ok: true }
}

/** Schedules a devotional to go live at a future time. */
export async function scheduleDevotional(id: number, scheduledFor: string) {
  const actor = await requirePermission("devotionals.manage")
  const when = new Date(scheduledFor)
  if (Number.isNaN(when.getTime())) throw new Error("Invalid schedule date")
  await db.update(devotional).set({ status: "scheduled", scheduledFor: when }).where(eq(devotional.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "devotional.schedule",
    targetType: "devotional",
    targetId: String(id),
    metadata: { scheduledFor: when.toISOString() },
  })
  revalidate()
  return { ok: true }
}

/** Archives a devotional (hidden from readers but kept for records). */
export async function archiveDevotional(id: number) {
  const actor = await requirePermission("devotionals.manage")
  await db.update(devotional).set({ status: "archived", scheduledFor: null }).where(eq(devotional.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "devotional.archive",
    targetType: "devotional",
    targetId: String(id),
  })
  revalidate()
  return { ok: true }
}

/** Moves an archived devotional back to draft so it can be edited and re-published. */
export async function restoreDevotional(id: number) {
  const actor = await requirePermission("devotionals.manage")
  await db.update(devotional).set({ status: "draft" }).where(eq(devotional.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "devotional.restore",
    targetType: "devotional",
    targetId: String(id),
  })
  revalidate()
  return { ok: true }
}

/** Duplicates a devotional as a new draft for quick reuse. */
export async function duplicateDevotional(id: number) {
  const actor = await requirePermission("devotionals.manage")
  const [src] = await db.select().from(devotional).where(eq(devotional.id, id)).limit(1)
  if (!src) throw new Error("Devotional not found")
  const now = new Date()
  const [row] = await db
    .insert(devotional)
    .values({
      title: `${src.title} (copy)`,
      verseRef: src.verseRef,
      verse: src.verse,
      body: src.body,
      prayer: src.prayer,
      cover: src.cover,
      readingMinutes: src.readingMinutes,
      publishDate: `dev-${now.getTime()}-${randomUUID().slice(0, 8)}`,
      status: "draft",
      scheduledFor: null,
      createdAt: now,
      lastPostedAt: now,
    })
    .returning({ id: devotional.id })
  await logAudit({
    adminId: actor.userId,
    action: "devotional.duplicate",
    targetType: "devotional",
    targetId: String(row.id),
    metadata: { from: String(id) },
  })
  revalidate()
  return { id: row.id }
}

/** Permanently deletes a devotional. */
export async function deleteDevotional(id: number) {
  const actor = await requirePermission("devotionals.manage")
  await db.delete(devotional).where(and(eq(devotional.id, id)))
  await logAudit({
    adminId: actor.userId,
    action: "devotional.delete",
    targetType: "devotional",
    targetId: String(id),
    result: "success",
  })
  revalidate()
  return { ok: true }
}
