import { and, count, desc, eq, inArray, lte, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { feedPost, qotdQuestion } from "@/lib/db/schema"
import { qotdChannel, type QotdQuestionRow, type QotdStatus } from "@/lib/qotd-types"

export type { QotdStatus, QotdQuestionRow } from "@/lib/qotd-types"

/** Response (discussion) counts for a set of question ids, via feed_post channels. */
async function getResponseCounts(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map()
  const channels = ids.map((id) => qotdChannel(id))
  const rows = await db
    .select({ channel: feedPost.channel, n: count() })
    .from(feedPost)
    .where(inArray(feedPost.channel, channels))
    .groupBy(feedPost.channel)
  const map = new Map<number, number>()
  for (const r of rows) {
    const id = Number((r.channel ?? "").split(":")[1])
    if (Number.isFinite(id)) map.set(id, Number(r.n))
  }
  return map
}

/**
 * Publishes a question and demotes the current featured one to the archive,
 * preserving its discussion. Shared by the admin "publish" action and the
 * lazy activation of due scheduled questions. Ensures exactly one live question.
 */
export async function publishQuestionRow(id: number): Promise<void> {
  const now = new Date()
  // Archive any question that is currently published/scheduled (except this one)
  // so only the newly published question is featured.
  await db
    .update(qotdQuestion)
    .set({ status: "archived", archivedAt: now, scheduledFor: null })
    .where(and(inArray(qotdQuestion.status, ["published", "scheduled"]), ne(qotdQuestion.id, id)))
  await db
    .update(qotdQuestion)
    .set({ status: "published", publishedAt: now, scheduledFor: null, archivedAt: null })
    .where(eq(qotdQuestion.id, id))
}

/**
 * Promotes any scheduled question whose time has arrived to published. Called at
 * read time so a scheduled question goes live without a background job. If
 * several are due, the most recent one wins (and archives the rest).
 */
export async function activateDueQuestions(): Promise<void> {
  const due = await db
    .select({ id: qotdQuestion.id })
    .from(qotdQuestion)
    .where(and(eq(qotdQuestion.status, "scheduled"), lte(qotdQuestion.scheduledFor, new Date())))
    .orderBy(desc(qotdQuestion.scheduledFor))
  if (due.length === 0) return
  // Publish the most-recently-due question; publishQuestionRow archives the rest.
  await publishQuestionRow(due[0].id)
}

function toRow(
  r: typeof qotdQuestion.$inferSelect,
  liveId: number | null,
  responseCount: number,
): QotdQuestionRow {
  return {
    id: r.id,
    questionText: r.questionText,
    image: r.image,
    status: r.status as QotdStatus,
    activeDate: r.activeDate,
    scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString() : null,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    isLive: r.id === liveId,
    responseCount,
  }
}

/** The single live/featured question, or null if none is published yet. */
export async function getActiveQuestion(): Promise<QotdQuestionRow | null> {
  await activateDueQuestions()
  const [row] = await db
    .select()
    .from(qotdQuestion)
    .where(eq(qotdQuestion.status, "published"))
    .orderBy(desc(qotdQuestion.publishedAt))
    .limit(1)
  if (!row) return null
  const counts = await getResponseCounts([row.id])
  return toRow(row, row.id, counts.get(row.id) ?? 0)
}

/** A single question by id (any status) — used for archive detail views. */
export async function getQuestionById(id: number): Promise<QotdQuestionRow | null> {
  const [row] = await db.select().from(qotdQuestion).where(eq(qotdQuestion.id, id)).limit(1)
  if (!row) return null
  const live = await getLiveQuestionId()
  const counts = await getResponseCounts([id])
  return toRow(row, live, counts.get(id) ?? 0)
}

/** Id of the current live question (published, most recent). */
export async function getLiveQuestionId(): Promise<number | null> {
  const [row] = await db
    .select({ id: qotdQuestion.id })
    .from(qotdQuestion)
    .where(eq(qotdQuestion.status, "published"))
    .orderBy(desc(qotdQuestion.publishedAt))
    .limit(1)
  return row?.id ?? null
}

/**
 * Previous Questions of the Day for the public archive view — every archived
 * question, newest first, with its response count. Discussions are preserved.
 */
export async function getArchivedQuestions(): Promise<QotdQuestionRow[]> {
  const rows = await db
    .select()
    .from(qotdQuestion)
    .where(eq(qotdQuestion.status, "archived"))
    .orderBy(desc(sql`coalesce(${qotdQuestion.archivedAt}, ${qotdQuestion.publishedAt}, ${qotdQuestion.createdAt})`))
  const counts = await getResponseCounts(rows.map((r) => r.id))
  return rows.map((r) => toRow(r, null, counts.get(r.id) ?? 0))
}
