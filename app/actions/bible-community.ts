"use server"

// Live Bible reading fellowship: presence heartbeat, the header indicator
// summary (with same-book vs. global fallback), the readers list for the
// discovery sheet, and reading-streak tracking. Mirrors the proven livePresence
// heartbeat/poll pattern in app/actions/live.ts — no websockets; the client
// polls the heartbeat every few seconds and animates changes locally.

import { and, asc, desc, eq, gt, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { biblePresence, bibleReadingDay, follow, user as userTable } from "@/lib/db/schema"
import { getHandle } from "@/lib/identity"

// A reader whose heartbeat hasn't landed in this long is treated as "left".
// Clients ping every ~8s, so this tolerates a couple of missed beats.
const PRESENCE_STALE_MS = 45_000

export type BibleActivity = "reading" | "listening" | "highlighting" | "notes"

// Summary that drives the header presence indicator. The client decides the
// exact wording from these numbers so it can animate the count independently.
export type BibleIndicator = {
  // "book" → others are reading the same book; "global" → nobody else is in
  // this book so we fall back to the church-wide reading count.
  scope: "book" | "global"
  book: string
  // Other people (excluding you) currently reading the same book.
  sameBookOthers: number
  // Everyone currently reading the Bible anywhere (including you) — always ≥ 1,
  // so the indicator never shows zero.
  totalReaders: number
  // A few avatar URLs (never your own) for a stacked avatar cluster.
  sampleAvatars: string[]
}

export type BibleReaderCard = {
  userId: string
  name: string
  handle: string
  image: string | null
  book: string
  chapter: number
  activity: BibleActivity
  online: boolean
  streak: number
  isFollowing: boolean
  isSelf: boolean
}

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

function freshCutoff(): Date {
  return new Date(Date.now() - PRESENCE_STALE_MS)
}

/**
 * Computes the current-run reading streak (consecutive days ending today) from
 * a set of YYYY-MM-DD day strings. Reading right now guarantees today is
 * present, so we count backwards from today.
 */
function computeStreak(days: Set<string>, today: string): number {
  if (!days.has(today)) {
    // Grace: if they haven't been recorded today yet, count from yesterday.
    const y = addDays(today, -1)
    if (!days.has(y)) return 0
  }
  let streak = 0
  let cursor = days.has(today) ? today : addDays(today, -1)
  while (days.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

/**
 * Heartbeat — upserts the caller's presence row (where they're reading + what
 * they're doing), records today's reading day for streaks, and returns the
 * fresh header indicator. Safe to call on a short interval.
 */
export async function heartbeatBiblePresence(input: {
  book: string
  chapter: number
  activity: BibleActivity
  // Caller's local calendar day (YYYY-MM-DD) for streak accounting.
  day: string
}): Promise<BibleIndicator | null> {
  const u = await getSessionUser()
  if (!u) return null

  const now = new Date()

  // Upsert presence keyed by userId (one reading location per person).
  await db
    .insert(biblePresence)
    .values({
      userId: u.id,
      userName: u.name,
      userImage: u.image ?? null,
      book: input.book,
      chapter: input.chapter,
      activity: input.activity,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: biblePresence.userId,
      set: {
        userName: u.name,
        userImage: u.image ?? null,
        book: input.book,
        chapter: input.chapter,
        activity: input.activity,
        lastSeenAt: now,
      },
    })

  // Record today's reading day for the streak (no-op if already recorded).
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.day)) {
    await db
      .insert(bibleReadingDay)
      .values({ userId: u.id, day: input.day })
      .onConflictDoNothing({ target: [bibleReadingDay.userId, bibleReadingDay.day] })
  }

  return getBibleIndicator({ book: input.book })
}

/** Fresh header indicator for the given book, with same-book → global fallback. */
export async function getBibleIndicator(input: { book: string }): Promise<BibleIndicator | null> {
  const u = await getSessionUser()
  if (!u) return null

  const rows = await db
    .select({
      userId: biblePresence.userId,
      userImage: biblePresence.userImage,
      book: biblePresence.book,
    })
    .from(biblePresence)
    .where(gt(biblePresence.lastSeenAt, freshCutoff()))

  const others = rows.filter((r) => r.userId !== u.id)
  const sameBookOthers = others.filter((r) => r.book === input.book)
  const totalReaders = new Set(rows.map((r) => r.userId)).size || 1

  const scope: "book" | "global" = sameBookOthers.length > 0 ? "book" : "global"
  const pool = scope === "book" ? sameBookOthers : others
  const sampleAvatars = pool
    .map((r) => r.userImage)
    .filter((x): x is string => Boolean(x))
    .slice(0, 3)

  return {
    scope,
    book: input.book,
    sameBookOthers: sameBookOthers.length,
    totalReaders,
    sampleAvatars,
  }
}

/**
 * Readers for the discovery sheet. scope "book" → only readers of `book`;
 * scope "global" → all current readers (client groups them by book). Excludes
 * nobody: the caller is included so the sheet mirrors the header count, but
 * flagged isSelf so the UI can label/skip actions.
 */
export async function getBibleReaders(input: {
  scope: "book" | "global"
  book: string
}): Promise<BibleReaderCard[]> {
  const u = await getSessionUser()
  if (!u) return []

  const base = await db
    .select()
    .from(biblePresence)
    .where(gt(biblePresence.lastSeenAt, freshCutoff()))
    .orderBy(asc(biblePresence.book), desc(biblePresence.lastSeenAt))

  const rows = input.scope === "book" ? base.filter((r) => r.book === input.book) : base
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.userId)

  // Who the caller already follows (for inline Follow buttons).
  const followingRows = await db
    .select({ followingId: follow.followingId })
    .from(follow)
    .where(and(eq(follow.followerId, u.id), inArray(follow.followingId, ids)))
  const followingSet = new Set(followingRows.map((f) => f.followingId))

  // Streaks: pull every reading-day row for these users once, compute in JS.
  const dayRows = await db
    .select({ userId: bibleReadingDay.userId, day: bibleReadingDay.day })
    .from(bibleReadingDay)
    .where(inArray(bibleReadingDay.userId, ids))
  const daysByUser = new Map<string, Set<string>>()
  for (const r of dayRows) {
    const set = daysByUser.get(r.userId) ?? new Set<string>()
    set.add(r.day)
    daysByUser.set(r.userId, set)
  }
  const today = new Date().toISOString().slice(0, 10)

  return rows.map((r) => ({
    userId: r.userId,
    name: r.userName,
    handle: getHandle(r.userName),
    image: r.userImage ?? null,
    book: r.book,
    chapter: r.chapter,
    activity: (r.activity as BibleActivity) ?? "reading",
    online: true,
    streak: computeStreak(daysByUser.get(r.userId) ?? new Set(), today),
    isFollowing: followingSet.has(r.userId),
    isSelf: r.userId === u.id,
  }))
}

/** Removes the caller's presence row when they leave the Bible page. */
export async function leaveBiblePresence(): Promise<void> {
  const u = await getSessionUser()
  if (!u) return
  await db.delete(biblePresence).where(eq(biblePresence.userId, u.id))
}
