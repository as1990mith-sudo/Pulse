import "server-only"

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  announcement,
  article,
  episode,
  feedPost,
  liveStream,
  organization,
  statusUpdate,
  user as userTable,
} from "@/lib/db/schema"
import {
  CONTENT_TYPE_ASPECT,
  CONTENT_TYPE_LABEL,
  canonicalPath,
  fallbackImageFor,
  type ShareContentType,
  type ShareMetadata,
  type ShareRef,
} from "@/lib/share/share-metadata"

/**
 * Frequency Rich Link Preview — server-side metadata resolver (spec §18).
 *
 * The ONE place that turns a content reference into a fully-resolved
 * ShareMetadata from the database. Deliberately viewer-agnostic and
 * public-safe: it returns exactly what a public link crawler is allowed to see,
 * so the same result powers both external Open Graph tags and the in-app
 * preview card without ever leaking private data (spec §15).
 *
 *  - Returns `null` when the item is missing, deleted, or unpublished
 *    (spec §16) so callers can render an "unavailable" state.
 *  - Returns metadata with `restricted: true` and a generic title/description
 *    when the item exists but its details are members-only (spec §15).
 *
 * Trusted-internal by design (spec §22): Frequency reads its own database
 * rather than scraping its own pages.
 */
export async function getShareMetadata(ref: ShareRef): Promise<ShareMetadata | null> {
  switch (ref.type) {
    case "article":
      return resolveArticle(numeric(ref.id))
    case "event":
      return resolveEvent(numeric(ref.id), ref.handle)
    case "audio":
    case "video":
    case "live":
      return resolveLiveOrReplay(String(ref.id))
    case "organisation":
      return resolveOrganisation(ref.handle)
    case "user":
      return resolveUser(ref.id)
    case "post":
    case "community":
      return resolvePost(numeric(ref.id), ref.type)
    case "status":
      return resolveStatus(numeric(ref.id))
    default:
      return null
  }
}

/** Convenience for the internal preview: resolve straight from a pasted URL. */
export async function getShareMetadataForUrl(url: string): Promise<ShareMetadata | null> {
  const { parseFrequencyPath } = await import("@/lib/share/share-metadata")
  const ref = parseFrequencyPath(url)
  if (!ref) return null
  return getShareMetadata(ref)
}

// --- helpers ----------------------------------------------------------------

function numeric(v: string | number): number {
  return typeof v === "number" ? v : Number.parseInt(v, 10)
}

function base(type: ShareContentType, canonicalUrl: string): Pick<ShareMetadata, "contentType" | "canonicalUrl" | "contentTypeLabel" | "aspect"> {
  return {
    contentType: type,
    canonicalUrl,
    contentTypeLabel: CONTENT_TYPE_LABEL[type],
    aspect: CONTENT_TYPE_ASPECT[type],
  }
}

/** A generic, detail-free preview for members-only / restricted content. */
function restrictedMetadata(type: ShareContentType, canonicalUrl: string): ShareMetadata {
  return {
    ...base(type, canonicalUrl),
    title: "Private content",
    description: "This content is only available to members of this Home.",
    thumbnailUrl: fallbackImageFor(type),
    authorName: null,
    authorAvatar: null,
    organisationName: null,
    organisationLogo: null,
    publishedAt: null,
    restricted: true,
  }
}

/** Looks up an organisation's public branding by id (for attributed content). */
async function orgBranding(orgId: string | null): Promise<{ name: string | null; logo: string | null }> {
  if (!orgId) return { name: null, logo: null }
  const [row] = await db
    .select({ name: organization.name, logo: organization.logo })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1)
  return { name: row?.name ?? null, logo: row?.logo ?? null }
}

async function resolveArticle(id: number): Promise<ShareMetadata | null> {
  if (Number.isNaN(id)) return null
  const [row] = await db.select().from(article).where(eq(article.id, id)).limit(1)
  if (!row) return null
  const canonicalUrl = canonicalPath({ type: "article", id })
  // Only published articles are publicly shareable; drafts/archived are hidden.
  if (row.status !== "published") return restrictedMetadata("article", canonicalUrl)
  const org = await orgBranding(row.organizationId)
  return {
    ...base("article", canonicalUrl),
    title: row.title,
    description: row.excerpt || null,
    thumbnailUrl: row.coverUrl || fallbackImageFor("article"),
    authorName: row.authorName,
    authorAvatar: row.authorImage,
    organisationName: row.publishedAsType === "home" ? org.name : null,
    organisationLogo: row.publishedAsType === "home" ? org.logo : null,
    publishedAt: (row.publishedAt ?? row.createdAt)?.toISOString() ?? null,
  }
}

async function resolveEvent(id: number, handle: string): Promise<ShareMetadata | null> {
  if (Number.isNaN(id)) return null
  const [row] = await db.select().from(announcement).where(eq(announcement.id, id)).limit(1)
  if (!row || row.adType !== "event") return null
  const canonicalUrl = canonicalPath({ type: "event", id, handle })
  // The public event page only exists when the admin enabled it AND the event
  // was approved. Otherwise expose nothing beyond a generic private card.
  if (!row.publicPageEnabled || row.status !== "approved") return restrictedMetadata("event", canonicalUrl)
  const org = await orgBranding(row.organizationId)
  const online = !row.location || /online|virtual|zoom|meet|stream/i.test(row.location)
  return {
    ...base("event", canonicalUrl),
    title: row.title,
    description: row.description || null,
    thumbnailUrl: row.flyer || fallbackImageFor("event"),
    authorName: row.creatorName,
    authorAvatar: null,
    organisationName: org.name ?? row.creatorName,
    organisationLogo: org.logo,
    publishedAt: (row.publishedAt ?? row.createdAt)?.toISOString() ?? null,
    extra: { eventDate: row.eventDate, location: row.location, online },
  }
}

/**
 * The `/live/[id]` route serves either an in-progress broadcast (liveStream,
 * keyed by roomName) or a published on-demand replay (episode, keyed by slug).
 * We mirror that resolution order here, and pick audio/video/live precisely:
 *   - a live broadcast → contentType "live" (label LIVE)
 *   - an audio replay   → contentType "audio"
 *   - a video replay    → contentType "video" (from episode.mediaKind)
 */
async function resolveLiveOrReplay(id: string): Promise<ShareMetadata | null> {
  // 1. In-progress live broadcast (keyed by roomName).
  const [live] = await db
    .select({
      title: liveStream.title,
      cover: liveStream.cover,
      hostName: liveStream.hostName,
      visibility: liveStream.visibility,
      topic: liveStream.topic,
    })
    .from(liveStream)
    .where(and(eq(liveStream.roomName, id), eq(liveStream.status, "live")))
    .limit(1)
  if (live) {
    const canonicalUrl = canonicalPath({ type: "live", id })
    if (live.visibility !== "public") return restrictedMetadata("live", canonicalUrl)
    return {
      ...base("live", canonicalUrl),
      title: live.title,
      description: live.topic || "Live now on Frequency",
      thumbnailUrl: live.cover || fallbackImageFor("live"),
      authorName: live.hostName,
      authorAvatar: null,
      organisationName: null,
      organisationLogo: null,
      publishedAt: null,
      extra: { liveStatus: "live" },
    }
  }

  // 2. Published on-demand replay (episode, keyed by slug).
  const [row] = await db.select().from(episode).where(eq(episode.slug, id)).limit(1)
  if (!row) return null
  // Audio vs video is a property of the row, not the URL.
  const type: ShareContentType = row.mediaKind === "video" ? "video" : "audio"
  const canonicalUrl = canonicalPath({ type, id })
  if (row.isPrivate) return restrictedMetadata(type, canonicalUrl)
  return {
    ...base(type, canonicalUrl),
    title: row.title,
    description: row.description || row.tagline || null,
    thumbnailUrl: row.cover || fallbackImageFor(type),
    authorName: row.hostName,
    authorAvatar: null,
    // Episodes attribute to their host; Home branding isn't stored on the row.
    organisationName: null,
    organisationLogo: null,
    publishedAt: row.createdAt?.toISOString() ?? null,
  }
}

async function resolveOrganisation(handle: string): Promise<ShareMetadata | null> {
  const [row] = await db
    .select({
      name: organization.name,
      handle: organization.handle,
      logo: organization.logo,
      cover: organization.cover,
      description: organization.description,
      category: organization.category,
    })
    .from(organization)
    .where(eq(organization.handle, handle))
    .limit(1)
  if (!row) return null
  const canonicalUrl = canonicalPath({ type: "organisation", handle: row.handle })
  const categoryLabel = row.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return {
    ...base("organisation", canonicalUrl),
    title: row.name,
    description: row.description || `${categoryLabel} on Frequency`,
    thumbnailUrl: row.cover || row.logo || fallbackImageFor("organisation"),
    authorName: null,
    authorAvatar: null,
    organisationName: row.name,
    organisationLogo: row.logo,
    publishedAt: null,
    extra: { organisationType: categoryLabel },
  }
}

async function resolveUser(id: string): Promise<ShareMetadata | null> {
  const [row] = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image, bio: userTable.bio })
    .from(userTable)
    .where(eq(userTable.id, id))
    .limit(1)
  if (!row) return null
  const canonicalUrl = canonicalPath({ type: "user", id: row.id })
  return {
    ...base("user", canonicalUrl),
    title: row.name,
    description: row.bio || `${row.name} on Frequency`,
    thumbnailUrl: row.image || fallbackImageFor("user"),
    authorName: row.name,
    authorAvatar: row.image,
    organisationName: null,
    organisationLogo: null,
    publishedAt: null,
  }
}

async function resolvePost(id: number, type: "post" | "community"): Promise<ShareMetadata | null> {
  if (Number.isNaN(id)) return null
  const [row] = await db.select().from(feedPost).where(eq(feedPost.id, id)).limit(1)
  if (!row || row.deleted) return null
  const canonicalUrl = canonicalPath({ type, id })
  // Home-scoped posts are members-only; expose only a generic card publicly so
  // a private post's text/media never leaks through metadata (spec §15).
  if (row.homeId) return restrictedMetadata(type, canonicalUrl)
  const org = await orgBranding(row.organizationId)
  const firstImage = row.media?.find((m) => m.type === "image")?.url || row.image || null
  const excerpt = row.text.length > 200 ? `${row.text.slice(0, 197)}…` : row.text
  return {
    ...base(type, canonicalUrl),
    title: row.authorName,
    description: excerpt,
    thumbnailUrl: firstImage || fallbackImageFor(type),
    authorName: row.authorName,
    authorAvatar: null,
    organisationName: org.name,
    organisationLogo: org.logo,
    publishedAt: row.createdAt?.toISOString() ?? null,
  }
}

async function resolveStatus(id: number): Promise<ShareMetadata | null> {
  if (Number.isNaN(id)) return null
  const [row] = await db.select().from(statusUpdate).where(eq(statusUpdate.id, id)).limit(1)
  if (!row) return null
  const canonicalUrl = canonicalPath({ type: "status", id })
  return {
    ...base("status", canonicalUrl),
    title: row.authorName,
    description: row.caption || "Shared a status on Frequency",
    thumbnailUrl: row.mediaUrl || fallbackImageFor("status"),
    authorName: row.authorName,
    authorAvatar: null,
    organisationName: null,
    organisationLogo: null,
    publishedAt: row.createdAt?.toISOString() ?? null,
  }
}
