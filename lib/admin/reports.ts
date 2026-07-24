import { and, count, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  article,
  articleComment,
  communityPost,
  contentModerationState,
  contentReport,
  episode,
  feedComment,
  feedPost,
  moderationAction,
} from "@/lib/db/schema"

export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed"

export type ContentSnapshot = {
  found: boolean
  authorId: string | null
  authorName: string | null
  title: string | null
  excerpt: string | null
  createdAt: string | null
  state: "visible" | "hidden" | "removed"
}

export type ReportRow = {
  id: string
  contentType: string
  contentId: string
  reporterId: string | null
  reason: string
  details: string | null
  status: ReportStatus
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  reportCount: number // how many reports exist for this same content
  content: ContentSnapshot
}

const PAGE_SIZE = 20

/** Human labels for the content types we support in the queue. */
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  feed_post: "Feed Post",
  feed_comment: "Feed Comment",
  article: "Article",
  article_comment: "Article Comment",
  episode: "Episode",
  community_post: "Community Post",
  user: "User",
}

/** Loads a lightweight snapshot for each (type,id) pair so the queue can show
 * what was reported without a round-trip per row. */
async function loadSnapshots(
  pairs: { contentType: string; contentId: string }[],
): Promise<Map<string, ContentSnapshot>> {
  const map = new Map<string, ContentSnapshot>()
  const byType = new Map<string, number[]>()
  for (const p of pairs) {
    const n = Number(p.contentId)
    if (!Number.isNaN(n)) {
      const arr = byType.get(p.contentType) ?? []
      arr.push(n)
      byType.set(p.contentType, arr)
    }
  }

  const key = (t: string, id: string) => `${t}:${id}`

  async function fill<T extends { id: number }>(
    type: string,
    rows: T[],
    pick: (r: T) => Omit<ContentSnapshot, "found" | "state">,
  ) {
    for (const r of rows) {
      map.set(key(type, String(r.id)), { found: true, state: "visible", ...pick(r) })
    }
  }

  const jobs: Promise<void>[] = []
  for (const [type, ids] of byType) {
    if (ids.length === 0) continue
    if (type === "feed_post") {
      jobs.push(
        db
          .select()
          .from(feedPost)
          .where(inArray(feedPost.id, ids))
          .then((rows) =>
            fill(type, rows, (r) => ({
              authorId: r.userId,
              authorName: r.authorName,
              title: null,
              excerpt: r.text.slice(0, 200),
              createdAt: r.createdAt.toISOString(),
            })),
          ),
      )
    } else if (type === "feed_comment") {
      jobs.push(
        db
          .select()
          .from(feedComment)
          .where(inArray(feedComment.id, ids))
          .then((rows) =>
            fill(type, rows, (r) => ({
              authorId: r.userId,
              authorName: r.authorName,
              title: null,
              excerpt: r.text.slice(0, 200),
              createdAt: r.createdAt.toISOString(),
            })),
          ),
      )
    } else if (type === "article") {
      jobs.push(
        db
          .select()
          .from(article)
          .where(inArray(article.id, ids))
          .then((rows) =>
            fill(type, rows, (r) => ({
              authorId: r.authorId,
              authorName: r.authorName,
              title: r.title,
              excerpt: r.excerpt.slice(0, 200),
              createdAt: r.createdAt.toISOString(),
            })),
          ),
      )
    } else if (type === "article_comment") {
      jobs.push(
        db
          .select()
          .from(articleComment)
          .where(inArray(articleComment.id, ids))
          .then((rows) =>
            fill(type, rows, (r) => ({
              authorId: r.userId,
              authorName: r.userName,
              title: null,
              excerpt: r.body.slice(0, 200),
              createdAt: r.createdAt.toISOString(),
            })),
          ),
      )
    } else if (type === "episode") {
      jobs.push(
        db
          .select()
          .from(episode)
          .where(inArray(episode.id, ids))
          .then((rows) =>
            fill(type, rows, (r) => ({
              authorId: r.hostUserId,
              authorName: r.hostName,
              title: r.title,
              excerpt: r.description?.slice(0, 200) ?? null,
              createdAt: r.createdAt.toISOString(),
            })),
          ),
      )
    } else if (type === "community_post") {
      jobs.push(
        db
          .select()
          .from(communityPost)
          .where(inArray(communityPost.id, ids))
          .then((rows) =>
            fill(type, rows, (r) => ({
              authorId: r.userId,
              authorName: "Anonymous",
              title: null,
              excerpt: r.body.slice(0, 200),
              createdAt: r.createdAt.toISOString(),
            })),
          ),
      )
    }
  }
  await Promise.all(jobs)

  // Overlay moderation state (hidden/removed) from content_moderation_state.
  const states = await db
    .select()
    .from(contentModerationState)
    .where(
      sql`(${contentModerationState.contentType}, ${contentModerationState.contentId}) in ${sql.raw(
        "(" + pairs.map((p) => `('${p.contentType}','${p.contentId}')`).join(",") + ")",
      )}`,
    )
  for (const s of states) {
    const k = key(s.contentType, s.contentId)
    const existing = map.get(k)
    if (existing) existing.state = s.state as ContentSnapshot["state"]
    else
      map.set(k, {
        found: false,
        authorId: null,
        authorName: null,
        title: null,
        excerpt: null,
        createdAt: null,
        state: s.state as ContentSnapshot["state"],
      })
  }

  return map
}

/** Lists reports filtered by status, newest first, with content snapshots and
 * a de-duplicated count of how many reports target the same content. */
export async function listReports(
  status: ReportStatus | "all" = "pending",
  page = 0,
): Promise<{ rows: ReportRow[]; total: number; counts: Record<string, number> }> {
  const where = status === "all" ? undefined : eq(contentReport.status, status)

  const base = db.select().from(contentReport)
  const [reports, [totalRow], statusCounts] = await Promise.all([
    (where ? base.where(where) : base)
      .orderBy(desc(contentReport.createdAt))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    where
      ? db.select({ n: count() }).from(contentReport).where(where)
      : db.select({ n: count() }).from(contentReport),
    db
      .select({ status: contentReport.status, n: count() })
      .from(contentReport)
      .groupBy(contentReport.status),
  ])

  const snapshots = await loadSnapshots(
    reports.map((r) => ({ contentType: r.contentType, contentId: r.contentId })),
  )

  // Count reports per content across ALL statuses for a "reported N times" badge.
  const dupCounts = await db
    .select({ contentType: contentReport.contentType, contentId: contentReport.contentId, n: count() })
    .from(contentReport)
    .groupBy(contentReport.contentType, contentReport.contentId)
  const dupMap = new Map(dupCounts.map((d) => [`${d.contentType}:${d.contentId}`, Number(d.n)]))

  const counts: Record<string, number> = { all: 0 }
  for (const c of statusCounts) {
    counts[c.status] = Number(c.n)
    counts.all += Number(c.n)
  }

  const rows: ReportRow[] = reports.map((r) => {
    const k = `${r.contentType}:${r.contentId}`
    return {
      id: r.id,
      contentType: r.contentType,
      contentId: r.contentId,
      reporterId: r.reporterId,
      reason: r.reason,
      details: r.details,
      status: r.status as ReportStatus,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      reportCount: dupMap.get(k) ?? 1,
      content:
        snapshots.get(k) ??
        {
          found: false,
          authorId: null,
          authorName: null,
          title: null,
          excerpt: null,
          createdAt: null,
          state: "visible",
        },
    }
  })

  return { rows, total: Number(totalRow?.n ?? 0), counts }
}

/** Lists content that has been hidden or removed by moderators (for the
 * "Removed Content" screen), with the ability to restore. */
export async function listRemovedContent(
  page = 0,
): Promise<{ rows: (ContentSnapshot & { contentType: string; contentId: string; reason: string | null; moderatedAt: string })[]; total: number }> {
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(contentModerationState)
      .where(inArray(contentModerationState.state, ["hidden", "removed"]))
      .orderBy(desc(contentModerationState.moderatedAt))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    db
      .select({ n: count() })
      .from(contentModerationState)
      .where(inArray(contentModerationState.state, ["hidden", "removed"])),
  ])

  const snapshots = await loadSnapshots(
    rows.map((r) => ({ contentType: r.contentType, contentId: r.contentId })),
  )

  return {
    rows: rows.map((r) => {
      const snap =
        snapshots.get(`${r.contentType}:${r.contentId}`) ??
        ({
          found: false,
          authorId: null,
          authorName: null,
          title: null,
          excerpt: null,
          createdAt: null,
          state: r.state as ContentSnapshot["state"],
        } as ContentSnapshot)
      return {
        ...snap,
        state: r.state as ContentSnapshot["state"],
        contentType: r.contentType,
        contentId: r.contentId,
        reason: r.reason,
        moderatedAt: r.moderatedAt.toISOString(),
      }
    }),
    total: Number(totalRow?.n ?? 0),
  }
}

/** Full moderation history for a single piece of content. */
export async function getContentHistory(contentType: string, contentId: string) {
  const rows = await db
    .select()
    .from(moderationAction)
    .where(and(eq(moderationAction.targetType, contentType), eq(moderationAction.targetId, contentId)))
    .orderBy(desc(moderationAction.createdAt))
    .limit(50)
  return rows.map((m) => ({
    id: m.id,
    action: m.action,
    reason: m.reason,
    adminId: m.adminId,
    createdAt: m.createdAt.toISOString(),
  }))
}
