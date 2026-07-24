import { and, count, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  announcement,
  article,
  auditLog,
  bookSubmission,
  contentReport,
  devotional,
  feedComment,
  feedPost,
  liveStream,
  session,
  storeProduct,
  supportTicket,
  user as userTable,
} from "@/lib/db/schema"

/** Start of the current day (server time) for "today" counts. */
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

async function countRows(table: Parameters<typeof db.select>[0] extends never ? never : any, where?: any) {
  const [row] = where
    ? await db.select({ n: count() }).from(table).where(where)
    : await db.select({ n: count() }).from(table)
  return Number(row?.n ?? 0)
}

/**
 * Live activity numbers for the Command Centre, all sourced from the database
 * so nothing is fabricated. "Online" approximates users with an unexpired
 * session; the rest are true "today" counts.
 */
export async function getLiveActivity() {
  const today = startOfToday()
  const now = new Date()
  const [online, registrations, posts, comments, streamsLive, articlesToday] = await Promise.all([
    countRows(session, gte(session.expiresAt, now)),
    countRows(userTable, gte(userTable.createdAt, today)),
    countRows(feedPost, gte(feedPost.createdAt, today)),
    countRows(feedComment, gte(feedComment.createdAt, today)),
    countRows(liveStream, eq(liveStream.status, "live")),
    countRows(article, and(eq(article.status, "published"), gte(article.publishedAt, today))),
  ])
  return {
    online,
    registrations,
    posts,
    comments,
    streamsLive,
    articlesToday,
  }
}

/** Counts of things awaiting an admin, driving the "what needs attention" view. */
export async function getModerationQueue() {
  const [reports, tickets, pendingBooks] = await Promise.all([
    countRows(contentReport, eq(contentReport.status, "pending")),
    countRows(supportTicket, eq(supportTicket.status, "open")),
    countRows(bookSubmission, eq(bookSubmission.status, "pending")),
  ])
  return { reports, tickets, pendingBooks }
}

/** Devotional + content status for the Command Centre. */
export async function getContentStatus() {
  const [latestDevo] = await db.select().from(devotional).orderBy(desc(devotional.lastPostedAt)).limit(1)
  const [totalDevotionals, upcomingEvents, publishedBooks] = await Promise.all([
    countRows(devotional),
    // Upcoming events: approved adverts of type "event" that haven't expired.
    countRows(
      announcement,
      and(eq(announcement.adType, "event"), eq(announcement.status, "approved"), gte(announcement.expiresAt, new Date())),
    ),
    countRows(storeProduct, and(eq(storeProduct.kind, "book"), eq(storeProduct.published, true))),
  ])
  return {
    todayDevotional: latestDevo ? { title: latestDevo.title, date: latestDevo.publishDate } : null,
    totalDevotionals,
    upcomingEvents,
    publishedBooks,
  }
}

/** Platform-health signals. DB is measured for real; infra tiles are labeled
 * as needing an external monitor rather than showing invented numbers. */
export async function getPlatformHealth() {
  let dbOk = true
  let dbLatencyMs = 0
  try {
    const t = Date.now()
    await db.execute(sql`select 1`)
    dbLatencyMs = Date.now() - t
  } catch {
    dbOk = false
  }
  return {
    database: { ok: dbOk, latencyMs: dbLatencyMs },
    // These have no in-app source; surfaced as "connect a monitor" placeholders.
    server: { status: "unmonitored" as const },
    api: { status: "unmonitored" as const },
    storage: { status: "unmonitored" as const },
    jobs: { status: "unmonitored" as const },
    push: { status: "unmonitored" as const },
    cdn: { status: "unmonitored" as const },
  }
}

/** The most recent admin actions, for the activity timeline. */
export async function getActivityTimeline(limit = 12) {
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit)
  return rows
}

export type LiveActivity = Awaited<ReturnType<typeof getLiveActivity>>
export type ModerationQueue = Awaited<ReturnType<typeof getModerationQueue>>
export type ContentStatus = Awaited<ReturnType<typeof getContentStatus>>
export type PlatformHealth = Awaited<ReturnType<typeof getPlatformHealth>>
