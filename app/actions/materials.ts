"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { catalogueItem, organization, playlist, playlistMaterial } from "@/lib/db/schema"
import {
  type MaterialContentType,
  type MaterialSource,
  type MaterialView,
  defaultContentTypeForSource,
  detectSource,
  durationToSeconds,
  formatDuration,
  formatTotalDuration,
  parseTags,
} from "@/lib/materials"

// --- permission + helpers --------------------------------------------------

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

async function isOrgOwner(orgId: string): Promise<boolean> {
  const uid = await currentUserId()
  if (!uid) return false
  const [org] = await db.select({ ownerId: organization.ownerId }).from(organization).where(eq(organization.id, orgId)).limit(1)
  return Boolean(org && org.ownerId === uid)
}

async function requireOrgOwner(orgId: string) {
  const uid = await currentUserId()
  if (!uid) throw new Error("You must be signed in to do that.")
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) throw new Error("Organisation not found.")
  if (org.ownerId !== uid) throw new Error("You can only manage your own organisation.")
  return org
}

async function orgHandle(orgId: string): Promise<string | null> {
  const [row] = await db.select({ handle: organization.handle }).from(organization).where(eq(organization.id, orgId)).limit(1)
  return row?.handle ?? null
}

async function revalidateOrg(orgId: string) {
  const handle = await orgHandle(orgId)
  if (handle) revalidatePath(`/org/${handle}`)
}

function normalizeUrl(raw?: string | null): string | null {
  const v = raw?.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}

function toMaterialView(row: typeof catalogueItem.$inferSelect): MaterialView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description,
    url: row.url,
    source: (row.source as MaterialSource) ?? "other",
    creator: row.creator,
    contentType: (row.contentType as MaterialContentType) ?? "video",
    category: row.category,
    tags: parseTags(row.tags),
    cover: row.cover,
    duration: row.duration,
    resourceDateMs: row.resourceDate ? row.resourceDate.getTime() : null,
    createdAtMs: row.createdAt.getTime(),
    archived: Boolean(row.archivedAt),
  }
}

// --- reads -----------------------------------------------------------------

/**
 * All Materials for an organisation. Archived rows are included only for the
 * organisation owner (shown with an "Archived" badge); members never see them.
 */
export async function getOrganizationMaterials(orgId: string): Promise<MaterialView[]> {
  const rows = await db
    .select()
    .from(catalogueItem)
    .where(eq(catalogueItem.organizationId, orgId))
    .orderBy(desc(catalogueItem.createdAt))
  const owner = await isOrgOwner(orgId)
  const views = rows.map(toMaterialView)
  return owner ? views : views.filter((v) => !v.archived)
}

// --- resource recognition (oEmbed + OpenGraph) -----------------------------

export type RecognizedResource = {
  /** Whether we resolved *any* useful metadata (false → manual entry). */
  recognized: boolean
  source: MaterialSource
  contentType: MaterialContentType
  title: string
  description: string
  thumbnail: string
  creator: string
  /** Formatted duration label, e.g. "48:21" (empty when unknown). */
  duration: string
}

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), ms)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; FrequencyBot/1.0)" },
      cache: "no-store",
    })
    clearTimeout(t)
    return res.ok ? res : null
  } catch {
    return null
  }
}

async function oembed(endpoint: string): Promise<Record<string, unknown> | null> {
  const res = await fetchWithTimeout(endpoint)
  if (!res) return null
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function metaTag(html: string, property: string): string {
  // Matches both name= and property= in either attribute order.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return decodeEntities(m[1])
  }
  return ""
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
}

/**
 * Best-effort metadata for a pasted external link. Uses each platform's public
 * oEmbed endpoint where available and falls back to scraping OpenGraph tags.
 * Always returns a usable object — `recognized: false` means the admin should
 * fill the fields manually. NEVER downloads or stores the media itself.
 */
export async function recognizeResource(rawUrl: string): Promise<RecognizedResource> {
  const url = normalizeUrl(rawUrl) ?? ""
  const source = detectSource(url)
  const base: RecognizedResource = {
    recognized: false,
    source,
    contentType: defaultContentTypeForSource(source),
    title: "",
    description: "",
    thumbnail: "",
    creator: "",
    duration: "",
  }
  if (!url) return base

  // Platform oEmbed endpoints ------------------------------------------------
  if (source === "youtube") {
    const data = await oembed(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    if (data) {
      return {
        ...base,
        recognized: true,
        title: String(data.title ?? ""),
        creator: String(data.author_name ?? ""),
        thumbnail: String(data.thumbnail_url ?? ""),
      }
    }
  } else if (source === "vimeo") {
    const data = await oembed(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`)
    if (data) {
      return {
        ...base,
        recognized: true,
        title: String(data.title ?? ""),
        creator: String(data.author_name ?? ""),
        thumbnail: String(data.thumbnail_url ?? ""),
        description: String(data.description ?? ""),
        duration: typeof data.duration === "number" ? formatDuration(data.duration) : "",
      }
    }
  } else if (source === "spotify") {
    const data = await oembed(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
    if (data) {
      return {
        ...base,
        recognized: true,
        title: String(data.title ?? ""),
        thumbnail: String(data.thumbnail_url ?? ""),
      }
    }
  }

  // Generic OpenGraph fallback (Facebook, Drive, Meet, other, or a failed
  // oEmbed above). Some hosts block bots — that's fine, we degrade to manual.
  const res = await fetchWithTimeout(url)
  if (res) {
    try {
      const html = (await res.text()).slice(0, 200_000)
      const title = metaTag(html, "og:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "")
      const thumbnail = metaTag(html, "og:image")
      const description = metaTag(html, "og:description")
      const creator = metaTag(html, "og:site_name")
      if (title || thumbnail || description) {
        return {
          ...base,
          recognized: true,
          title: decodeEntities(title).trim(),
          thumbnail,
          description,
          creator,
        }
      }
    } catch {
      // ignore — fall through to manual
    }
  }

  return base
}

export type ImportedLink = {
  url: string
  status: "ready" | "unsupported"
  recognized?: RecognizedResource
}

/** Recognise a batch of pasted links for the Import Links flow. */
export async function recognizeMany(rawUrls: string[]): Promise<ImportedLink[]> {
  const seen = new Set<string>()
  const urls = rawUrls
    .map((u) => normalizeUrl(u))
    .filter((u): u is string => Boolean(u))
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
    .slice(0, 40)

  const results = await Promise.all(
    urls.map(async (url): Promise<ImportedLink> => {
      const recognized = await recognizeResource(url)
      // "Unsupported" only when we got nothing back AND the platform is unknown.
      const status = recognized.recognized || recognized.source !== "other" ? "ready" : "unsupported"
      return { url, status, recognized }
    }),
  )
  return results
}

// --- material CRUD ---------------------------------------------------------

export type SaveMaterialInput = {
  organizationId: string
  title: string
  url: string
  description?: string | null
  source?: MaterialSource
  creator?: string | null
  contentType?: MaterialContentType
  category?: string | null
  tags?: string[]
  cover?: string | null
  duration?: string | null
  /** ISO date string (yyyy-mm-dd) or full ISO; parsed to a timestamp. */
  resourceDate?: string | null
}

export async function createMaterial(input: SaveMaterialInput) {
  await requireOrgOwner(input.organizationId)
  const title = input.title.trim()
  if (!title) throw new Error("Please give the material a title.")
  const url = normalizeUrl(input.url)
  if (!url) throw new Error("Please paste a link to the resource.")

  const source = input.source ?? detectSource(url)
  const contentType = input.contentType ?? defaultContentTypeForSource(source)
  const resourceDate = input.resourceDate ? new Date(input.resourceDate) : new Date()

  await db.insert(catalogueItem).values({
    organizationId: input.organizationId,
    title,
    description: input.description?.trim() || null,
    // Keep the legacy `kind` column coherent for any old reader.
    kind: contentType === "article" || contentType === "resource" ? "document" : contentType === "audio" || contentType === "podcast" ? "audio" : "video",
    url,
    cover: input.cover || null,
    duration: input.duration?.trim() || null,
    source,
    creator: input.creator?.trim() || null,
    contentType,
    category: input.category?.trim() || null,
    tags: JSON.stringify(input.tags ?? []),
    resourceDate: Number.isNaN(resourceDate.getTime()) ? new Date() : resourceDate,
    updatedAt: new Date(),
  })
  await revalidateOrg(input.organizationId)
  return { ok: true }
}

export async function createMaterialsBulk(inputs: SaveMaterialInput[]) {
  if (inputs.length === 0) return { ok: true, count: 0 }
  const orgId = inputs[0].organizationId
  await requireOrgOwner(orgId)
  const rows = inputs
    .filter((i) => i.organizationId === orgId)
    .map((i) => {
      const url = normalizeUrl(i.url)
      if (!url || !i.title.trim()) return null
      const source = i.source ?? detectSource(url)
      const contentType = i.contentType ?? defaultContentTypeForSource(source)
      const resourceDate = i.resourceDate ? new Date(i.resourceDate) : new Date()
      return {
        organizationId: orgId,
        title: i.title.trim(),
        description: i.description?.trim() || null,
        kind: contentType === "article" || contentType === "resource" ? "document" : contentType === "audio" || contentType === "podcast" ? "audio" : "video",
        url,
        cover: i.cover || null,
        duration: i.duration?.trim() || null,
        source,
        creator: i.creator?.trim() || null,
        contentType,
        category: i.category?.trim() || null,
        tags: JSON.stringify(i.tags ?? []),
        resourceDate: Number.isNaN(resourceDate.getTime()) ? new Date() : resourceDate,
        updatedAt: new Date(),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (rows.length === 0) throw new Error("None of those links could be added.")
  await db.insert(catalogueItem).values(rows)
  await revalidateOrg(orgId)
  return { ok: true, count: rows.length }
}

export async function updateMaterial(input: SaveMaterialInput & { id: number }) {
  await requireOrgOwner(input.organizationId)
  const title = input.title.trim()
  if (!title) throw new Error("Please give the material a title.")
  const url = normalizeUrl(input.url)
  if (!url) throw new Error("Please paste a link to the resource.")
  const source = input.source ?? detectSource(url)
  const contentType = input.contentType ?? defaultContentTypeForSource(source)
  const resourceDate = input.resourceDate ? new Date(input.resourceDate) : null

  await db
    .update(catalogueItem)
    .set({
      title,
      description: input.description?.trim() || null,
      url,
      cover: input.cover || null,
      duration: input.duration?.trim() || null,
      source,
      creator: input.creator?.trim() || null,
      contentType,
      category: input.category?.trim() || null,
      tags: JSON.stringify(input.tags ?? []),
      ...(resourceDate && !Number.isNaN(resourceDate.getTime()) ? { resourceDate } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(catalogueItem.id, input.id), eq(catalogueItem.organizationId, input.organizationId)))
  await revalidateOrg(input.organizationId)
  return { ok: true }
}

export async function duplicateMaterial(input: { id: number; organizationId: string }) {
  await requireOrgOwner(input.organizationId)
  const [row] = await db
    .select()
    .from(catalogueItem)
    .where(and(eq(catalogueItem.id, input.id), eq(catalogueItem.organizationId, input.organizationId)))
    .limit(1)
  if (!row) throw new Error("Material not found.")
  await db.insert(catalogueItem).values({
    organizationId: row.organizationId,
    title: `${row.title} (copy)`,
    description: row.description,
    kind: row.kind,
    url: row.url,
    cover: row.cover,
    duration: row.duration,
    source: row.source,
    creator: row.creator,
    contentType: row.contentType,
    category: row.category,
    tags: row.tags,
    resourceDate: row.resourceDate,
    updatedAt: new Date(),
  })
  await revalidateOrg(input.organizationId)
  return { ok: true }
}

export async function setMaterialArchived(input: { id: number; organizationId: string; archived: boolean }) {
  await requireOrgOwner(input.organizationId)
  await db
    .update(catalogueItem)
    .set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(catalogueItem.id, input.id), eq(catalogueItem.organizationId, input.organizationId)))
  await revalidateOrg(input.organizationId)
  return { ok: true }
}

export async function deleteMaterial(input: { id: number; organizationId: string }) {
  await requireOrgOwner(input.organizationId)
  await db
    .delete(catalogueItem)
    .where(and(eq(catalogueItem.id, input.id), eq(catalogueItem.organizationId, input.organizationId)))
  // A material must exist once; deleting it removes every playlist reference too.
  await db.delete(playlistMaterial).where(eq(playlistMaterial.materialId, input.id))
  await revalidateOrg(input.organizationId)
  return { ok: true }
}

// --- playlists -------------------------------------------------------------

export type PlaylistView = {
  id: number
  organizationId: string
  name: string
  description: string | null
  cover: string | null
  /** Up to four material covers for the 2×2 collage, newest position first. */
  collage: string[]
  count: number
  totalDurationLabel: string
  createdAtMs: number
  updatedAtMs: number
}

/**
 * All playlists for an organisation with derived collage + counts. One grouped
 * pass over the join rows avoids an N+1 across playlists.
 */
export async function getOrganizationPlaylists(orgId: string): Promise<PlaylistView[]> {
  const lists = await db
    .select()
    .from(playlist)
    .where(eq(playlist.organizationId, orgId))
    .orderBy(desc(playlist.updatedAt))
  if (lists.length === 0) return []

  const listIds = lists.map((l) => l.id)
  const joins = await db
    .select({
      playlistId: playlistMaterial.playlistId,
      position: playlistMaterial.position,
      cover: catalogueItem.cover,
      duration: catalogueItem.duration,
    })
    .from(playlistMaterial)
    .innerJoin(catalogueItem, eq(playlistMaterial.materialId, catalogueItem.id))
    .where(inArray(playlistMaterial.playlistId, listIds))
    .orderBy(asc(playlistMaterial.position))

  const byList = new Map<number, { covers: string[]; seconds: number; count: number }>()
  for (const id of listIds) byList.set(id, { covers: [], seconds: 0, count: 0 })
  for (const j of joins) {
    const agg = byList.get(j.playlistId)
    if (!agg) continue
    agg.count += 1
    agg.seconds += durationToSeconds(j.duration)
    if (j.cover && agg.covers.length < 4) agg.covers.push(j.cover)
  }

  return lists.map((l) => {
    const agg = byList.get(l.id) ?? { covers: [], seconds: 0, count: 0 }
    return {
      id: l.id,
      organizationId: l.organizationId,
      name: l.name,
      description: l.description,
      cover: l.cover,
      collage: agg.covers,
      count: agg.count,
      totalDurationLabel: formatTotalDuration(agg.seconds),
      createdAtMs: l.createdAt.getTime(),
      updatedAtMs: l.updatedAt.getTime(),
    }
  })
}

export type PlaylistDetail = {
  playlist: PlaylistView
  materials: MaterialView[]
}

/** A single playlist with its materials in playlist order. */
export async function getPlaylist(orgId: string, playlistId: number): Promise<PlaylistDetail | null> {
  const [row] = await db
    .select()
    .from(playlist)
    .where(and(eq(playlist.id, playlistId), eq(playlist.organizationId, orgId)))
    .limit(1)
  if (!row) return null

  const joined = await db
    .select({ item: catalogueItem, position: playlistMaterial.position })
    .from(playlistMaterial)
    .innerJoin(catalogueItem, eq(playlistMaterial.materialId, catalogueItem.id))
    .where(eq(playlistMaterial.playlistId, playlistId))
    .orderBy(asc(playlistMaterial.position))

  const materials = joined.map((j) => toMaterialView(j.item))
  const seconds = materials.reduce((acc, m) => acc + durationToSeconds(m.duration), 0)
  const covers = materials.map((m) => m.cover).filter((c): c is string => Boolean(c)).slice(0, 4)

  return {
    playlist: {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      description: row.description,
      cover: row.cover,
      collage: covers,
      count: materials.length,
      totalDurationLabel: formatTotalDuration(seconds),
      createdAtMs: row.createdAt.getTime(),
      updatedAtMs: row.updatedAt.getTime(),
    },
    materials,
  }
}

export async function createPlaylist(input: {
  organizationId: string
  name: string
  description?: string | null
  cover?: string | null
  materialIds?: number[]
}) {
  await requireOrgOwner(input.organizationId)
  const name = input.name.trim()
  if (!name) throw new Error("Please name the playlist.")
  const [created] = await db
    .insert(playlist)
    .values({
      organizationId: input.organizationId,
      name,
      description: input.description?.trim() || null,
      cover: input.cover || null,
      updatedAt: new Date(),
    })
    .returning({ id: playlist.id })

  if (created && input.materialIds && input.materialIds.length > 0) {
    await addMaterialsToPlaylist({
      organizationId: input.organizationId,
      playlistId: created.id,
      materialIds: input.materialIds,
    })
  }
  await revalidateOrg(input.organizationId)
  return { ok: true, id: created?.id }
}

export async function updatePlaylist(input: {
  id: number
  organizationId: string
  name: string
  description?: string | null
  cover?: string | null
}) {
  await requireOrgOwner(input.organizationId)
  const name = input.name.trim()
  if (!name) throw new Error("Please name the playlist.")
  await db
    .update(playlist)
    .set({
      name,
      description: input.description?.trim() || null,
      cover: input.cover ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(playlist.id, input.id), eq(playlist.organizationId, input.organizationId)))
  await revalidateOrg(input.organizationId)
  return { ok: true }
}

export async function duplicatePlaylist(input: { id: number; organizationId: string }) {
  await requireOrgOwner(input.organizationId)
  const [row] = await db
    .select()
    .from(playlist)
    .where(and(eq(playlist.id, input.id), eq(playlist.organizationId, input.organizationId)))
    .limit(1)
  if (!row) throw new Error("Playlist not found.")
  const [created] = await db
    .insert(playlist)
    .values({
      organizationId: row.organizationId,
      name: `${row.name} (copy)`,
      description: row.description,
      cover: row.cover,
      updatedAt: new Date(),
    })
    .returning({ id: playlist.id })

  // Copy the membership rows (references only — materials are never duplicated).
  const members = await db
    .select()
    .from(playlistMaterial)
    .where(eq(playlistMaterial.playlistId, input.id))
    .orderBy(asc(playlistMaterial.position))
  if (created && members.length > 0) {
    await db.insert(playlistMaterial).values(
      members.map((m, i) => ({ playlistId: created.id, materialId: m.materialId, position: i })),
    )
  }
  await revalidateOrg(input.organizationId)
  return { ok: true, id: created?.id }
}

export async function deletePlaylist(input: { id: number; organizationId: string }) {
  await requireOrgOwner(input.organizationId)
  await db.delete(playlist).where(and(eq(playlist.id, input.id), eq(playlist.organizationId, input.organizationId)))
  await db.delete(playlistMaterial).where(eq(playlistMaterial.playlistId, input.id))
  await revalidateOrg(input.organizationId)
  return { ok: true }
}

/** Append materials to a playlist, skipping any already present (dedup by pair). */
export async function addMaterialsToPlaylist(input: {
  organizationId: string
  playlistId: number
  materialIds: number[]
}) {
  await requireOrgOwner(input.organizationId)
  // Ownership of the playlist itself.
  const [pl] = await db
    .select({ id: playlist.id })
    .from(playlist)
    .where(and(eq(playlist.id, input.playlistId), eq(playlist.organizationId, input.organizationId)))
    .limit(1)
  if (!pl) throw new Error("Playlist not found.")

  // Only materials that belong to the same organisation may be referenced.
  const owned = await db
    .select({ id: catalogueItem.id })
    .from(catalogueItem)
    .where(and(eq(catalogueItem.organizationId, input.organizationId), inArray(catalogueItem.id, input.materialIds)))
  const ownedIds = new Set(owned.map((o) => o.id))

  const existing = await db
    .select({ materialId: playlistMaterial.materialId })
    .from(playlistMaterial)
    .where(eq(playlistMaterial.playlistId, input.playlistId))
  const present = new Set(existing.map((e) => e.materialId))
  let position = existing.length

  const toAdd = input.materialIds
    .filter((id) => ownedIds.has(id) && !present.has(id))
    .map((materialId) => ({ playlistId: input.playlistId, materialId, position: position++ }))

  if (toAdd.length > 0) {
    await db.insert(playlistMaterial).values(toAdd)
    await db.update(playlist).set({ updatedAt: new Date() }).where(eq(playlist.id, input.playlistId))
  }
  await revalidateOrg(input.organizationId)
  return { ok: true, added: toAdd.length }
}

export async function removeMaterialFromPlaylist(input: {
  organizationId: string
  playlistId: number
  materialId: number
}) {
  await requireOrgOwner(input.organizationId)
  const [pl] = await db
    .select({ id: playlist.id })
    .from(playlist)
    .where(and(eq(playlist.id, input.playlistId), eq(playlist.organizationId, input.organizationId)))
    .limit(1)
  if (!pl) throw new Error("Playlist not found.")
  await db
    .delete(playlistMaterial)
    .where(and(eq(playlistMaterial.playlistId, input.playlistId), eq(playlistMaterial.materialId, input.materialId)))
  await db.update(playlist).set({ updatedAt: new Date() }).where(eq(playlist.id, input.playlistId))
  await revalidateOrg(input.organizationId)
  return { ok: true }
}

/** Persist a new material order for a playlist (drag-to-reorder). */
export async function reorderPlaylist(input: {
  organizationId: string
  playlistId: number
  orderedMaterialIds: number[]
}) {
  await requireOrgOwner(input.organizationId)
  const [pl] = await db
    .select({ id: playlist.id })
    .from(playlist)
    .where(and(eq(playlist.id, input.playlistId), eq(playlist.organizationId, input.organizationId)))
    .limit(1)
  if (!pl) throw new Error("Playlist not found.")
  await Promise.all(
    input.orderedMaterialIds.map((materialId, position) =>
      db
        .update(playlistMaterial)
        .set({ position })
        .where(and(eq(playlistMaterial.playlistId, input.playlistId), eq(playlistMaterial.materialId, materialId))),
    ),
  )
  await db.update(playlist).set({ updatedAt: new Date() }).where(eq(playlist.id, input.playlistId))
  await revalidateOrg(input.organizationId)
  return { ok: true }
}
