import { and, count, desc, eq, gt, inArray, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { devotional, devotionalComment } from "@/lib/db/schema"

export type DevotionalStatus = "draft" | "scheduled" | "published" | "archived"

export const DEVOTIONAL_STATUSES: DevotionalStatus[] = ["published", "scheduled", "draft", "archived"]

export const DEVOTIONAL_STATUS_LABELS: Record<DevotionalStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
}

export type DevotionalRow = {
  id: number
  title: string
  verseRef: string
  verse: string
  body: string
  prayer: string
  cover: string | null
  readingMinutes: number
  publishDate: string
  status: DevotionalStatus
  scheduledFor: string | null
  createdAt: string
  lastPostedAt: string
  isLive: boolean // the single row currently shown on the homepage
  commentCount: number
}

const PAGE_SIZE = 20

/** Counts per lifecycle status, for the tab badges. */
export async function getDevotionalCounts(): Promise<Record<DevotionalStatus | "all", number>> {
  const rows = await db
    .select({ status: devotional.status, n: count() })
    .from(devotional)
    .groupBy(devotional.status)
  const counts: Record<string, number> = { all: 0, draft: 0, scheduled: 0, published: 0, archived: 0 }
  for (const r of rows) {
    counts[r.status] = Number(r.n)
    counts.all += Number(r.n)
  }
  return counts as Record<DevotionalStatus | "all", number>
}

/**
 * The id of the devotional currently shown on the homepage: the most recent
 * live row (published, or scheduled and due). Used to badge the list.
 */
async function getLiveDevotionalId(): Promise<number | null> {
  const [row] = await db
    .select({ id: devotional.id })
    .from(devotional)
    .where(
      or(
        eq(devotional.status, "published"),
        and(eq(devotional.status, "scheduled"), sql`${devotional.scheduledFor} <= now()`),
      ),
    )
    .orderBy(desc(devotional.lastPostedAt))
    .limit(1)
  return row?.id ?? null
}

/** Paginated devotionals for a given lifecycle tab, newest activity first. */
export async function listDevotionals(
  status: DevotionalStatus | "all",
  page = 0,
): Promise<{ rows: DevotionalRow[]; total: number; counts: Record<DevotionalStatus | "all", number> }> {
  const where = status === "all" ? undefined : eq(devotional.status, status)

  const [rows, [{ total }], counts, liveId] = await Promise.all([
    db
      .select()
      .from(devotional)
      .where(where)
      .orderBy(desc(devotional.lastPostedAt))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    db.select({ total: count() }).from(devotional).where(where),
    getDevotionalCounts(),
    getLiveDevotionalId(),
  ])

  // Comment counts for the listed rows, keyed by the devotional's publishDate.
  const keys = rows.map((r) => r.publishDate)
  const commentCounts = new Map<string, number>()
  if (keys.length > 0) {
    const cc = await db
      .select({ key: devotionalComment.devotionalDate, n: count() })
      .from(devotionalComment)
      .where(inArray(devotionalComment.devotionalDate, keys))
      .groupBy(devotionalComment.devotionalDate)
    for (const r of cc) commentCounts.set(r.key, Number(r.n))
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      title: r.title,
      verseRef: r.verseRef,
      verse: r.verse,
      body: r.body,
      prayer: r.prayer,
      cover: r.cover,
      readingMinutes: r.readingMinutes,
      publishDate: r.publishDate,
      status: r.status as DevotionalStatus,
      scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      lastPostedAt: r.lastPostedAt.toISOString(),
      isLive: r.id === liveId,
      commentCount: commentCounts.get(r.publishDate) ?? 0,
    })),
    total: Number(total),
    counts,
  }
}

export type DevotionalAnalytics = {
  total: number
  published: number
  scheduled: number
  drafts: number
  archived: number
  totalComments: number
  avgReadingMinutes: number
  publishedLast30: number
}

/** Headline analytics for the module. */
export async function getDevotionalAnalytics(): Promise<DevotionalAnalytics> {
  const [counts, [{ comments }], [{ avgRead }], [{ recent }]] = await Promise.all([
    getDevotionalCounts(),
    db.select({ comments: count() }).from(devotionalComment),
    db.select({ avgRead: sql<number>`coalesce(avg(${devotional.readingMinutes}), 0)`.mapWith(Number) }).from(devotional),
    db
      .select({ recent: count() })
      .from(devotional)
      .where(and(eq(devotional.status, "published"), gt(devotional.lastPostedAt, sql`now() - interval '30 days'`))),
  ])

  return {
    total: counts.all,
    published: counts.published,
    scheduled: counts.scheduled,
    drafts: counts.draft,
    archived: counts.archived,
    totalComments: Number(comments),
    avgReadingMinutes: Math.round(Number(avgRead) * 10) / 10,
    publishedLast30: Number(recent),
  }
}
