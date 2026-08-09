import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { devotional, episode, user as userTable } from "@/lib/db/schema"
import type { Devotional, Show, Host, PodcastHost } from "@/lib/data"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { getEpisodeViewCounts } from "@/app/actions/engagement"

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  const days = Math.floor(seconds / 86400)
  if (days >= 7) return `${Math.floor(days / 7)}w ago`
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours}h ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 1) return `${minutes}m ago`
  return "just now"
}

/** Absolute published date, e.g. "Jun 20, 2026" — shown in the player. */
function formatPublishedDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function hostFromName(name: string): Host {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    avatar: "/placeholder.svg",
    handle: "@" + name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
  }
}

/**
 * Fetches the profile images for a set of host user ids in a single query,
 * returning a map of userId → image URL so episodes can show real avatars.
 */
async function getHostImages(rows: (typeof episode.$inferSelect)[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(rows.map((r) => r.hostUserId).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()
  const users = await db
    .select({ id: userTable.id, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, ids))
  return new Map(users.map((u) => [u.id, u.image]))
}

/** Maps a DB episode row to the Show shape the catalogue + live pages expect.
 * `views` is the episode's real play count, shown as "N views" on cards.
 * `hostImage` is the host's real profile picture when they have one. */
function episodeToShow(row: typeof episode.$inferSelect, views = 0, hostImage?: string | null): Show {
  // When a host published the session themselves, link their profile by userId.
  const host: Host = row.hostUserId
    ? {
        id: row.hostUserId,
        name: row.hostName,
        avatar: hostImage || "/placeholder.svg",
        handle: row.hostHandle || "@" + row.hostName.toLowerCase().replace(/[^a-z0-9]+/g, ""),
      }
    : hostFromName(row.hostName)

  return {
    id: row.slug,
    title: row.title,
    tagline: row.tagline,
    cover: row.cover || "/placeholder.svg",
    category: row.category,
    host,
    status: "ended",
    listeners: views,
    duration: row.duration || undefined,
    publishedAt: relativeTime(row.createdAt),
    publishedDate: formatPublishedDate(row.createdAt),
    description: row.description,
    audioUrl: row.audioUrl || undefined,
    videoUrl: row.videoUrl || undefined,
    // Prefer the persisted media kind — a still-processing live replay has no
    // media url yet, so inferring from videoUrl alone would misfile it under
    // Audio. Fall back to the url for any legacy row without a stored kind.
    mediaType: row.mediaKind === "video" || row.mediaKind === "audio" ? row.mediaKind : row.videoUrl ? "video" : "audio",
    playlist: row.playlist || undefined,
    episodeId: row.id,
    likes: row.likes,
    isPrivate: row.isPrivate,
    source: row.source === "live" ? "live" : "upload",
    processingStatus:
      row.processingStatus === "processing" || row.processingStatus === "failed"
        ? row.processingStatus
        : "ready",
    processingError: row.processingError || undefined,
    processingStartedAt: row.processingStartedAt ? row.processingStartedAt.toISOString() : undefined,
  }
}

/**
 * Episodes a specific host has published, newest first. Private episodes are
 * only included when the viewer is the host themselves (`includePrivate`).
 */
export async function getEpisodesByUser(userId: string, includePrivate = false): Promise<Show[]> {
  // Watchdog: when the host loads their own catalogue, flip any background
  // upload that has been "processing" for over 30 minutes to "failed" so a
  // crashed/closed uploader can never leave a row stuck in "Processing…".
  if (includePrivate) {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000)
    await db
      .update(episode)
      .set({ processingStatus: "failed", processingError: "Processing timed out" })
      .where(
        and(
          eq(episode.hostUserId, userId),
          eq(episode.processingStatus, "processing"),
          lte(episode.processingStartedAt, cutoff),
        ),
      )
      .catch(() => {})
  }

  const rows = await db
    .select()
    .from(episode)
    .where(
      includePrivate
        ? // The host sees ALL their own episodes, including "processing" and
          // "failed" placeholders (with a processing notice / retry).
          eq(episode.hostUserId, userId)
        : // Public visitors only see finished, non-private replays — never a
          // half-uploaded "processing" row or a "failed" one.
          and(
            eq(episode.hostUserId, userId),
            eq(episode.isPrivate, false),
            eq(episode.processingStatus, "ready"),
          ),
    )
    .orderBy(desc(episode.createdAt))

  const [viewCounts, hostImages] = await Promise.all([
    getEpisodeViewCounts(rows.map((r) => r.id)),
    getHostImages(rows),
  ])
  return rows.map((r) => episodeToShow(r, viewCounts.get(r.id) ?? 0, r.hostUserId ? hostImages.get(r.hostUserId) : null))
}

/**
 * The devotional shown on the homepage: the most recently published row from
 * the database, or null when none have been posted yet.
 */
export async function getLatestDevotional(): Promise<Devotional | null> {
  // Public visibility rule: a devotional is live if it is "published", or it is
  // "scheduled" and its scheduled time has arrived. Drafts, archived rows and
  // not-yet-due scheduled rows are hidden from readers.
  //
  // Wrapped in try/catch so a database outage (e.g. the provider is temporarily
  // unreachable or over its transfer quota) degrades gracefully to the "No
  // devotional yet" empty state on the homepage instead of throwing an
  // unhandled error that crashes the entire page render.
  let row
  try {
    ;[row] = await db
      .select()
      .from(devotional)
      .where(
        or(
          eq(devotional.status, "published"),
          and(eq(devotional.status, "scheduled"), lte(devotional.scheduledFor, sql`now()`)),
        ),
      )
      .orderBy(desc(devotional.lastPostedAt))
      .limit(1)
  } catch (err) {
    console.error("[v0] getLatestDevotional query failed:", err)
    return null
  }
  if (!row) return null
  return {
    date: row.publishDate,
    title: row.title,
    verseRef: row.verseRef,
    verse: row.verse,
    cover: row.cover || "/devotional/sunrise.png",
    readingMinutes: row.readingMinutes,
    body: row.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    prayer: row.prayer,
    initialLikes: 0,
    comments: [],
  }
}

/** Catalogue episodes: real published, non-private episodes, newest first. */
export async function getCatalogEpisodes(): Promise<Show[]> {
  const rows = await db
    .select()
    .from(episode)
    .where(eq(episode.isPrivate, false))
    .orderBy(desc(episode.createdAt))
  const [viewCounts, hostImages] = await Promise.all([
    getEpisodeViewCounts(rows.map((r) => r.id)),
    getHostImages(rows),
  ])
  return rows.map((r) => episodeToShow(r, viewCounts.get(r.id) ?? 0, r.hostUserId ? hostImages.get(r.hostUserId) : null))
}

/**
 * Podcast hosts for the library: every real user account that has published at
 * least one episode, aggregated with their catalogue summary. Episodes added by
 * the admin without a linked user account (hostUserId is null) are excluded so
 * the library only lists genuine host accounts.
 */
export async function getPodcastHosts(): Promise<PodcastHost[]> {
  const rows = await db
    .select({
      hostUserId: episode.hostUserId,
      title: episode.title,
      category: episode.category,
      createdAt: episode.createdAt,
      userName: userTable.name,
      userImage: userTable.image,
    })
    .from(episode)
    .innerJoin(userTable, eq(episode.hostUserId, userTable.id))
    .where(eq(episode.isPrivate, false))
    .orderBy(desc(episode.createdAt))

  const byHost = new Map<string, PodcastHost>()
  for (const row of rows) {
    const id = row.hostUserId as string
    const existing = byHost.get(id)
    if (existing) {
      existing.episodeCount += 1
      if (!existing.categories.includes(row.category)) existing.categories.push(row.category)
    } else {
      // Rows are newest-first, so the first one seen is the latest episode.
      byHost.set(id, {
        id,
        name: row.userName,
        handle: getHandle(row.userName),
        initials: getInitials(row.userName),
        color: getAvatarColor(id),
        image: row.userImage,
        episodeCount: 1,
        categories: [row.category],
        latestTitle: row.title,
        latestAt: relativeTime(row.createdAt),
      })
    }
  }
  return Array.from(byHost.values())
}

/** Resolves a published episode by its slug. */
export async function resolveShow(id: string): Promise<Show | undefined> {
  const [row] = await db.select().from(episode).where(eq(episode.slug, id)).limit(1)
  if (!row) return undefined
  const [viewCounts, hostImages] = await Promise.all([getEpisodeViewCounts([row.id]), getHostImages([row])])
  return episodeToShow(row, viewCounts.get(row.id) ?? 0, row.hostUserId ? hostImages.get(row.hostUserId) : null)
}

/** All admin-managed rows, for listing/deleting inside the dashboard. */
export async function getAdminContent() {
  const [devotionals, episodeRows] = await Promise.all([
    db.select().from(devotional).orderBy(desc(devotional.lastPostedAt)),
    db.select().from(episode).orderBy(desc(episode.createdAt)),
  ])
  return { devotionals, episodes: episodeRows }
}
