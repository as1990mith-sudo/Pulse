import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { devotional, episode } from "@/lib/db/schema"
import { dailyDevotional, episodes as staticEpisodes, getShow, type Devotional, type Show, type Host } from "@/lib/data"

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

function hostFromName(name: string): Host {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    avatar: "/placeholder.svg",
    handle: "@" + name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
  }
}

/** Maps a DB episode row to the Show shape the catalogue + live pages expect. */
function episodeToShow(row: typeof episode.$inferSelect): Show {
  return {
    id: row.slug,
    title: row.title,
    tagline: row.tagline,
    cover: row.cover || "/placeholder.svg",
    category: row.category,
    host: hostFromName(row.hostName),
    status: "ended",
    listeners: 0,
    duration: row.duration || undefined,
    publishedAt: relativeTime(row.createdAt),
    description: row.description,
  }
}

/**
 * The devotional shown on the homepage: the most recently published row from
 * the database, or the bundled sample devotional when none exist yet.
 */
export async function getLatestDevotional(): Promise<Devotional> {
  const [row] = await db.select().from(devotional).orderBy(desc(devotional.createdAt)).limit(1)
  if (!row) return dailyDevotional
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

/**
 * Catalogue episodes: admin-uploaded episodes first (newest first), followed by
 * the bundled sample episodes so the grid is never empty.
 */
export async function getCatalogEpisodes(): Promise<Show[]> {
  const rows = await db.select().from(episode).orderBy(desc(episode.createdAt))
  return [...rows.map(episodeToShow), ...staticEpisodes]
}

/** Resolves a show/episode by id, checking admin-uploaded episodes first. */
export async function resolveShow(id: string): Promise<Show | undefined> {
  const [row] = await db.select().from(episode).where(eq(episode.slug, id)).limit(1)
  if (row) return episodeToShow(row)
  return getShow(id)
}

/** All admin-managed rows, for listing/deleting inside the dashboard. */
export async function getAdminContent() {
  const [devotionals, episodeRows] = await Promise.all([
    db.select().from(devotional).orderBy(desc(devotional.createdAt)),
    db.select().from(episode).orderBy(desc(episode.createdAt)),
  ])
  return { devotionals, episodes: episodeRows }
}
