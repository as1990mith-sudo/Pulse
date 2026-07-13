"use server"

// Live Bible reading fellowship: presence heartbeat, the header indicator
// summary (with same-book vs. global fallback), the readers list for the
// discovery sheet, and reading-streak tracking. Mirrors the proven livePresence
// heartbeat/poll pattern in app/actions/live.ts — no websockets; the client
// polls the heartbeat every few seconds and animates changes locally.

import { and, asc, desc, eq, gt, inArray, notInArray, or } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  bibleChatSlot,
  biblePresence,
  bibleReadingDay,
  dmConversation,
  dmMessage,
  follow,
  user as userTable,
} from "@/lib/db/schema"
import { getHandle } from "@/lib/identity"
import { MAX_BIBLE_CHATS } from "@/lib/bible-chat-constants"

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

  // Current profile pictures straight from the user table — the presence row's
  // `userImage` is only a heartbeat snapshot, so this keeps reader-card and
  // resulting chat-bubble avatars showing each reader's real, up-to-date photo.
  const liveImages = await db
    .select({ id: userTable.id, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, ids))
  const imageById = new Map(liveImages.map((r) => [r.id, r.image ?? null]))

  return rows.map((r) => ({
    userId: r.userId,
    name: r.userName,
    handle: getHandle(r.userName),
    image: imageById.get(r.userId) ?? r.userImage ?? null,
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

// An unread DM from a fellow reader — used to pop a gentle in-Bible alert so the
// reader knows someone reading alongside them has reached out.
export type BibleReaderMessagePing = {
  conversationId: number
  userId: string
  name: string
  image: string | null
  preview: string
  // Where the sender is reading right now, for a "reading John 3" subtitle.
  book: string
  chapter: number
  createdAtMs: number
}

/**
 * Returns unread incoming DMs whose sender is ALSO currently reading the Bible.
 * Powers the floating "someone messaged you" bubble on the Bible page. Only
 * fellow readers qualify, keeping the alert reverent and relevant. Excludes
 * threads the caller has archived or cleared, and messages already read.
 */
export async function getBibleReaderMessagePings(): Promise<BibleReaderMessagePing[]> {
  const u = await getSessionUser()
  if (!u) return []

  // Who is reading right now (fresh presence), excluding the caller.
  const readers = await db
    .select({
      userId: biblePresence.userId,
      userName: biblePresence.userName,
      userImage: biblePresence.userImage,
      book: biblePresence.book,
      chapter: biblePresence.chapter,
    })
    .from(biblePresence)
    .where(gt(biblePresence.lastSeenAt, freshCutoff()))
  const readerMap = new Map(readers.filter((r) => r.userId !== u.id).map((r) => [r.userId, r]))
  if (readerMap.size === 0) return []

  // The presence row's `userImage` is a snapshot taken at heartbeat time, which
  // can be stale or missing. Pull each reader's CURRENT profile picture straight
  // from the user table (the app's canonical avatar source) so the chat bubble
  // always shows the sender's real photo instead of an initials fallback.
  const liveImages = await db
    .select({ id: userTable.id, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, [...readerMap.keys()]))
  const imageById = new Map(liveImages.map((r) => [r.id, r.image ?? null]))

  // Conversations where the other participant is a fellow reader.
  const convos = await db
    .select()
    .from(dmConversation)
    .where(or(eq(dmConversation.userAId, u.id), eq(dmConversation.userBId, u.id)))
    .orderBy(desc(dmConversation.lastMessageAt))

  const pings: BibleReaderMessagePing[] = []
  for (const conv of convos) {
    const isUserA = conv.userAId === u.id
    const otherId = isUserA ? conv.userBId : conv.userAId
    const reader = readerMap.get(otherId)
    if (!reader) continue // sender isn't currently reading — skip

    const myLastRead = isUserA ? conv.userALastReadAt : conv.userBLastReadAt
    const myDeletedAt = isUserA ? conv.userADeletedAt : conv.userBDeletedAt
    const archived = isUserA ? conv.userAArchived : conv.userBArchived
    if (archived) continue

    const [last] = await db
      .select()
      .from(dmMessage)
      .where(eq(dmMessage.conversationId, conv.id))
      .orderBy(desc(dmMessage.createdAt))
      .limit(1)
    if (!last) continue

    // Unread, sent by the other reader, and not hidden by a "delete chat".
    const unread = last.senderId === otherId && last.createdAt > myLastRead
    const clearedByDelete = Boolean(myDeletedAt && last.createdAt <= myDeletedAt)
    if (!unread || clearedByDelete) continue

    pings.push({
      conversationId: conv.id,
      userId: otherId,
      name: reader.userName,
      image: imageById.get(otherId) ?? reader.userImage ?? null,
      preview: last.deleted
        ? "Message deleted"
        : last.body?.trim()
          ? last.body.trim().slice(0, 90)
          : last.attachmentType
            ? `Sent ${last.attachmentType === "voice" ? "a voice note" : last.attachmentType === "verse" ? "a verse" : "an image"}`
            : "New message",
      book: reader.book,
      chapter: reader.chapter,
      createdAtMs: last.createdAt.getTime(),
    })
  }

  return pings.sort((a, b) => b.createdAtMs - a.createdAtMs)
}

/**
 * Read-only unread counts for a set of conversations — used by the collapsed
 * chat bubbles to show a badge WITHOUT marking anything read (unlike
 * getDmMessages, which marks read as a side effect). Counts incoming messages
 * newer than the caller's last-read marker, respecting "delete chat".
 */
export async function getBibleChatUnread(
  conversationIds: number[],
): Promise<Record<number, number>> {
  const u = await getSessionUser()
  if (!u || conversationIds.length === 0) return {}

  const convos = await db
    .select()
    .from(dmConversation)
    .where(inArray(dmConversation.id, conversationIds))

  const result: Record<number, number> = {}
  for (const conv of convos) {
    if (conv.userAId !== u.id && conv.userBId !== u.id) continue
    const isUserA = conv.userAId === u.id
    const myLastRead = isUserA ? conv.userALastReadAt : conv.userBLastReadAt
    const myDeletedAt = isUserA ? conv.userADeletedAt : conv.userBDeletedAt
    const otherId = isUserA ? conv.userBId : conv.userAId

    const rows = await db
      .select({ id: dmMessage.id, createdAt: dmMessage.createdAt })
      .from(dmMessage)
      .where(
        and(
          eq(dmMessage.conversationId, conv.id),
          eq(dmMessage.senderId, otherId),
          gt(dmMessage.createdAt, myLastRead),
        ),
      )
    const count = myDeletedAt ? rows.filter((r) => r.createdAt > myDeletedAt).length : rows.length
    result[conv.id] = count
  }
  return result
}

// --- Concurrent chat "slots" (max 4 bubbles per reader) --------------------

/**
 * Heartbeat for the set of chat bubbles the caller currently has open on their
 * Bible page. Upserts a fresh slot per open conversation and prunes slots for
 * any conversation that's no longer open. Passing an empty list clears them all
 * (e.g. when the reader goes private or leaves). Fresh slots are what other
 * readers' sends are checked against for the "max concurrent chats" rule.
 */
export async function syncBibleChatSlots(
  openConversations: { conversationId: number; partnerId: string }[],
): Promise<void> {
  const u = await getSessionUser()
  if (!u) return

  const ids = openConversations.map((c) => c.conversationId)

  // Prune slots the reader no longer has open.
  if (ids.length === 0) {
    await db.delete(bibleChatSlot).where(eq(bibleChatSlot.userId, u.id))
    return
  }
  await db
    .delete(bibleChatSlot)
    .where(and(eq(bibleChatSlot.userId, u.id), notInArray(bibleChatSlot.conversationId, ids)))

  // Upsert the currently-open ones, refreshing their heartbeat.
  const now = new Date()
  for (const c of openConversations.slice(0, MAX_BIBLE_CHATS)) {
    await db
      .insert(bibleChatSlot)
      .values({
        userId: u.id,
        conversationId: c.conversationId,
        partnerId: c.partnerId,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [bibleChatSlot.userId, bibleChatSlot.conversationId],
        set: { partnerId: c.partnerId, lastSeenAt: now },
      })
  }
}

export type BibleSendResult =
  | { ok: true }
  // The recipient already has the maximum number of concurrent chats open and
  // can't receive a new one right now.
  | { ok: false; reason: "full"; recipientName: string }

/**
 * Sends a message that originates from the in-Bible floating chat, enforcing
 * the recipient's concurrent-chat capacity. If the recipient already holds
 * MAX_BIBLE_CHATS fresh slots and this conversation isn't one of them, the send
 * is refused so the sender can be told the reader is unavailable. Continuing an
 * already-open chat is always allowed. Delivery itself is identical to a normal
 * DM (same table + inbox), so history is never lost.
 */
export async function sendBibleReaderMessage(input: {
  conversationId: number
  body?: string
  attachmentUrl?: string | null
  attachmentType?: "image" | "audio" | null
  attachmentName?: string | null
}): Promise<BibleSendResult> {
  const u = await getSessionUser()
  if (!u) throw new Error("You must be signed in to do that.")

  const [conv] = await db
    .select()
    .from(dmConversation)
    .where(eq(dmConversation.id, input.conversationId))
    .limit(1)
  if (!conv) throw new Error("Conversation not found.")
  if (conv.userAId !== u.id && conv.userBId !== u.id) {
    throw new Error("You are not part of this conversation.")
  }

  const recipientId = conv.userAId === u.id ? conv.userBId : conv.userAId

  // Capacity check against the recipient's fresh chat slots.
  const recipientSlots = await db
    .select({ conversationId: bibleChatSlot.conversationId })
    .from(bibleChatSlot)
    .where(and(eq(bibleChatSlot.userId, recipientId), gt(bibleChatSlot.lastSeenAt, freshCutoff())))

  const alreadyOpenWithMe = recipientSlots.some((s) => s.conversationId === input.conversationId)
  if (!alreadyOpenWithMe && recipientSlots.length >= MAX_BIBLE_CHATS) {
    const [recipient] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, recipientId))
      .limit(1)
    return { ok: false, reason: "full", recipientName: recipient?.name ?? "This reader" }
  }

  const body = (input.body ?? "").trim()
  const hasAttachment = Boolean(input.attachmentUrl)
  if (!body && !hasAttachment) throw new Error("Message cannot be empty.")

  await db.insert(dmMessage).values({
    conversationId: input.conversationId,
    senderId: u.id,
    body: body || null,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentType: hasAttachment ? input.attachmentType ?? "document" : null,
    attachmentName: input.attachmentName ?? null,
  })

  await db
    .update(dmConversation)
    .set({ lastMessageAt: new Date() })
    .where(eq(dmConversation.id, input.conversationId))

  revalidatePath(`/messages/${input.conversationId}`)
  revalidatePath("/messages")
  return { ok: true }
}
