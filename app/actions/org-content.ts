"use server"

import { and, asc, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { catalogueItem, event, organization } from "@/lib/db/schema"

async function requireOrgOwner(orgId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  const rows = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  const org = rows[0]
  if (!org) throw new Error("Organisation not found.")
  if (org.ownerId !== session.user.id) throw new Error("You can only manage your own organisation.")
  return org
}

// --- Events ----------------------------------------------------------------

export type EventView = {
  id: number
  title: string
  description: string | null
  startsAtMs: number
  endsAtMs: number | null
  dateLabel: string
  timeLabel: string
  locationName: string | null
  onlineUrl: string | null
  cover: string | null
  isPast: boolean
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
const TIME_FMT = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" })

function toEventView(row: typeof event.$inferSelect): EventView {
  const now = Date.now()
  const endMs = row.endsAt ? row.endsAt.getTime() : null
  const referenceEnd = endMs ?? row.startsAt.getTime()
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAtMs: row.startsAt.getTime(),
    endsAtMs: endMs,
    dateLabel: DATE_FMT.format(row.startsAt),
    timeLabel: TIME_FMT.format(row.startsAt),
    locationName: row.locationName,
    onlineUrl: row.onlineUrl,
    cover: row.cover,
    isPast: referenceEnd < now,
  }
}

/** Upcoming events first (soonest → latest), then past events (most recent). */
export async function getOrganizationEvents(orgId: string): Promise<{ upcoming: EventView[]; past: EventView[] }> {
  const rows = await db.select().from(event).where(eq(event.organizationId, orgId)).orderBy(asc(event.startsAt))
  const views = rows.map(toEventView)
  const upcoming = views.filter((v) => !v.isPast)
  const past = views.filter((v) => v.isPast).reverse()
  return { upcoming, past }
}

export type CreateEventInput = {
  organizationId: string
  title: string
  description?: string
  startsAt: string // ISO string from the client datetime-local input
  endsAt?: string
  locationName?: string
  onlineUrl?: string
  cover?: string
}

export async function createEvent(input: CreateEventInput) {
  await requireOrgOwner(input.organizationId)
  const title = input.title.trim()
  if (!title) throw new Error("Please give the event a title.")
  const startsAt = new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime())) throw new Error("Please choose a valid start date and time.")
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error("Please choose a valid end date and time.")

  await db.insert(event).values({
    organizationId: input.organizationId,
    title,
    description: input.description?.trim() || null,
    startsAt,
    endsAt: endsAt && endsAt > startsAt ? endsAt : null,
    locationName: input.locationName?.trim() || null,
    onlineUrl: normalizeUrl(input.onlineUrl),
    cover: input.cover || null,
  })
  const org = await orgHandle(input.organizationId)
  if (org) revalidatePath(`/org/${org}`)
  return { ok: true }
}

export async function deleteEvent(input: { id: number; organizationId: string }) {
  await requireOrgOwner(input.organizationId)
  await db.delete(event).where(and(eq(event.id, input.id), eq(event.organizationId, input.organizationId)))
  const org = await orgHandle(input.organizationId)
  if (org) revalidatePath(`/org/${org}`)
  return { ok: true }
}

// --- Catalogue -------------------------------------------------------------

export type CatalogueKind = "audio" | "video" | "document"

export type CatalogueItemView = {
  id: number
  title: string
  description: string | null
  kind: CatalogueKind
  url: string
  cover: string | null
  duration: string | null
}

function toCatalogueView(row: typeof catalogueItem.$inferSelect): CatalogueItemView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: (row.kind as CatalogueKind) ?? "audio",
    url: row.url,
    cover: row.cover,
    duration: row.duration,
  }
}

export async function getOrganizationCatalogue(orgId: string): Promise<CatalogueItemView[]> {
  const rows = await db
    .select()
    .from(catalogueItem)
    .where(eq(catalogueItem.organizationId, orgId))
    .orderBy(desc(catalogueItem.createdAt))
  return rows.map(toCatalogueView)
}

export type CreateCatalogueInput = {
  organizationId: string
  title: string
  description?: string
  kind: CatalogueKind
  url: string
  cover?: string
  duration?: string
}

export async function createCatalogueItem(input: CreateCatalogueInput) {
  await requireOrgOwner(input.organizationId)
  const title = input.title.trim()
  if (!title) throw new Error("Please give the resource a title.")
  const url = normalizeUrl(input.url)
  if (!url) throw new Error("Please add a link to the resource.")

  await db.insert(catalogueItem).values({
    organizationId: input.organizationId,
    title,
    description: input.description?.trim() || null,
    kind: input.kind,
    url,
    cover: input.cover || null,
    duration: input.duration?.trim() || null,
  })
  const org = await orgHandle(input.organizationId)
  if (org) revalidatePath(`/org/${org}`)
  return { ok: true }
}

export async function deleteCatalogueItem(input: { id: number; organizationId: string }) {
  await requireOrgOwner(input.organizationId)
  await db
    .delete(catalogueItem)
    .where(and(eq(catalogueItem.id, input.id), eq(catalogueItem.organizationId, input.organizationId)))
  const org = await orgHandle(input.organizationId)
  if (org) revalidatePath(`/org/${org}`)
  return { ok: true }
}

// --- helpers ---------------------------------------------------------------

async function orgHandle(orgId: string): Promise<string | null> {
  const rows = await db.select({ handle: organization.handle }).from(organization).where(eq(organization.id, orgId)).limit(1)
  return rows[0]?.handle ?? null
}

function normalizeUrl(raw?: string | null): string | null {
  const v = raw?.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}
