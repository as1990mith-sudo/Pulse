"use server"

import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { catalogueItem, episode, event, home, homeMembership, organization } from "@/lib/db/schema"
import { relativeTime } from "@/lib/content"
import { getEpisodeViewCounts } from "@/app/actions/engagement"

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
  // Set for auto-published Live replays (episodes): the replay's slug, so the
  // Catalogue links to the in-app player at /live/[slug] instead of treating
  // `url` as an external link. Undefined for manually-added catalogue items.
  slug?: string
  // Explicit media kind for a Live replay so the Live tab's Video/Audio split is
  // exact rather than guessed from the url. Undefined for manual items.
  mediaKind?: "video" | "audio"
  // --- Live-replay only: the extra metadata the video listing renders ---------
  // The Live › Video tab presents replays as full VideoCard rows (16:9 artwork,
  // title, @handle, "N views · when"), so those cards need the replay's real
  // engagement + authorship data rather than the org's generic fields.
  /** Real play count for the replay, shown as "N views". */
  views?: number
  /** Relative publish stamp, e.g. "just now" / "3d ago". */
  publishedAt?: string
  /** The streaming host's @handle (the card credits the person, not the org). */
  hostHandle?: string
  /** Drives the card's "Private" badge for owners. */
  isPrivate?: boolean
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

// Maps a finished live-replay episode into a Catalogue "Live" item. Returns null
// for a replay that has no finalized media url yet (still processing) — it can't
// be played, so it shouldn't appear.
function episodeToCatalogueView(row: typeof episode.$inferSelect, views = 0): CatalogueItemView | null {
  const url = row.videoUrl ?? row.audioUrl ?? ""
  if (!url) return null
  return {
    id: row.id,
    title: row.title,
    description: row.description || null,
    kind: "video", // the "Live" tab in the org Catalogue
    url,
    cover: row.cover,
    duration: row.duration,
    slug: row.slug,
    mediaKind: row.mediaKind === "video" ? "video" : "audio",
    views,
    publishedAt: relativeTime(row.createdAt),
    hostHandle: row.hostHandle || "@" + row.hostName.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    isPrivate: row.isPrivate,
  }
}

export async function getOrganizationCatalogue(orgId: string): Promise<CatalogueItemView[]> {
  // Manually-added resources (audio uploads & documents).
  const rows = await db
    .select()
    .from(catalogueItem)
    .where(eq(catalogueItem.organizationId, orgId))
    .orderBy(desc(catalogueItem.createdAt))
  const manual = rows.map(toCatalogueView)

  // Live replays recorded from finished sessions are stored as `episode` rows
  // (source "live"), NOT catalogue_item — which is why they never showed up in
  // the organisation Catalogue. Surface this organisation's Home replays here,
  // filed under the Catalogue's "Live" tab. A Home maps 1:1 to an organisation,
  // so scoping by that Home's id keeps a replay to the single Home its session
  // was started in and never leaks it into another Home's Catalogue.
  const [homeRow] = await db
    .select({ id: home.id })
    .from(home)
    .where(eq(home.organizationId, orgId))
    .limit(1)
  if (!homeRow) return manual

  // Replays saved before a session carried a Home (or saved while the host had
  // no active Home) were stamped with a null homeId and would otherwise be
  // orphaned — invisible in every Catalogue. Recover those by attributing them
  // to this organisation when the host is one of its admins/owner. Regular
  // members' personal recordings are excluded, so nothing leaks in.
  const adminRows = await db
    .select({ userId: homeMembership.userId })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeRow.id), ne(homeMembership.role, "member")))
  const [orgRow] = await db
    .select({ ownerId: organization.ownerId })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1)
  const adminIds = Array.from(
    new Set([...adminRows.map((r) => r.userId), ...(orgRow?.ownerId ? [orgRow.ownerId] : [])]),
  )

  // A private replay stays listed for the host who owns it, so "Make private" is
  // reversible from the Catalogue. Hiding it from its owner too would strand the
  // recording: the only control that can make it public again lives on this row.
  // Everyone else still never sees it.
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const replays = await db
    .select()
    .from(episode)
    .where(
      and(
        eq(episode.source, "live"),
        viewerId
          ? or(eq(episode.isPrivate, false), eq(episode.hostUserId, viewerId))
          : eq(episode.isPrivate, false),
        eq(episode.processingStatus, "ready"),
        adminIds.length > 0
          ? or(
              eq(episode.homeId, homeRow.id),
              and(isNull(episode.homeId), inArray(episode.hostUserId, adminIds)),
            )
          : eq(episode.homeId, homeRow.id),
      ),
    )
    .orderBy(desc(episode.createdAt))

  // Real play counts so the video cards show "N views" rather than a guess.
  const viewCounts = await getEpisodeViewCounts(replays.map((r) => r.id))
  const live = replays
    .map((r) => episodeToCatalogueView(r, viewCounts.get(r.id) ?? 0))
    .filter((v): v is CatalogueItemView => v !== null)

  // Live replays first (most relevant recent content), then manual resources.
  return [...live, ...manual]
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

/**
 * Renames a manually-added catalogue resource. Owner-only, and the update is
 * scoped by BOTH id and organizationId so a valid owner of one Home can't rename
 * a row belonging to another by passing a foreign id.
 */
export async function renameCatalogueItem(input: { id: number; organizationId: string; title: string }) {
  await requireOrgOwner(input.organizationId)
  const title = input.title.trim()
  if (!title) throw new Error("Please give the resource a title.")
  await db
    .update(catalogueItem)
    .set({ title })
    .where(and(eq(catalogueItem.id, input.id), eq(catalogueItem.organizationId, input.organizationId)))
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
