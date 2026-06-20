import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { devotional, episode, user as userTable } from "@/lib/db/schema"
import type { Devotional, Show, Host, PodcastHost } from "@/lib/data"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"

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
  // When a host published the session themselves, link their profile by userId.
  const host: Host = row.hostUserId
    ? {
        id: row.hostUserId,
        name: row.hostName,
        avatar: "/placeholder.svg",
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
    listeners: 0,
    duration: row.duration || undefined,
    publishedAt: relativeTime(row.createdAt),
    description: row.description,
    audioUrl: row.audioUrl || undefined,
    episodeId: row.id,
    likes: row.likes,
  }
}

/** Episodes a specific host has published, newest first. */
export async function getEpisodesByUser(userId: string): Promise<Show[]> {
  const rows = await db
    .select()
    .from(episode)
    .where(eq(episode.hostUserId, userId))
    .orderBy(desc(episode.createdAt))
  return rows.map(episodeToShow)
}

/**
 * The devotional shown on the homepage: the most recently published row from
 * the database, or null when none have been posted yet.
 */
export async function getLatestDevotional(): Promise<Devotional | null> {
  const [row] = await db.select().from(devotional).orderBy(desc(devotional.lastPostedAt)).limit(1)
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

/** Catalogue episodes: real published episodes, newest first. */
export async function getCatalogEpisodes(): Promise<Show[]> {
  const rows = await db.select().from(episode).orderBy(desc(episode.createdAt))
  return rows.map(episodeToShow)
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
  return row ? episodeToShow(row) : undefined
}

/** All admin-managed rows, for listing/deleting inside the dashboard. */
export async function getAdminContent() {
  const [devotionals, episodeRows] = await Promise.all([
    db.select().from(devotional).orderBy(desc(devotional.lastPostedAt)),
    db.select().from(episode).orderBy(desc(episode.createdAt)),
  ])
  return { devotionals, episodes: episodeRows }
}
