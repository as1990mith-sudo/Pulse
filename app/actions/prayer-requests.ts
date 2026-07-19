"use server"

// Participant prayer requests inside a live. Anyone in the room can submit a
// request (signed-out viewers post anonymously) and tap "I prayed" to bump a
// simple tally. Requests are scoped to the room they were posted in.

import { desc, eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { prayerRequest } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"

const MAX_BODY = 1000

export type PrayerRequestView = {
  id: number
  authorName: string
  body: string
  isAnonymous: boolean
  prayedCount: number
  createdAt: string
  isMine: boolean
}

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function submitPrayerRequest(input: {
  roomName: string
  body: string
  isAnonymous?: boolean
}): Promise<{ ok: boolean; request: PrayerRequestView | null }> {
  const body = input.body.trim().slice(0, MAX_BODY)
  if (!input.roomName || !body) return { ok: false, request: null }

  const user = await getCurrentUser()
  const isAnonymous = input.isAnonymous ?? !user
  const authorName = isAnonymous ? "Anonymous" : (user?.name ?? "Anonymous")

  const [row] = await db
    .insert(prayerRequest)
    .values({
      roomName: input.roomName,
      userId: user?.id ?? null,
      authorName,
      body,
      isAnonymous,
    })
    .returning()

  return { ok: true, request: { ...toView(row, user?.id ?? null) } }
}

export async function prayForRequest(id: number): Promise<{ ok: boolean; prayedCount: number }> {
  const [row] = await db
    .update(prayerRequest)
    .set({ prayedCount: sql`${prayerRequest.prayedCount} + 1` })
    .where(eq(prayerRequest.id, id))
    .returning({ prayedCount: prayerRequest.prayedCount })
  return { ok: Boolean(row), prayedCount: row?.prayedCount ?? 0 }
}

export async function getPrayerRequests(roomName: string): Promise<PrayerRequestView[]> {
  if (!roomName) return []
  const viewerId = await getUserId()
  const rows = await db
    .select()
    .from(prayerRequest)
    .where(eq(prayerRequest.roomName, roomName))
    .orderBy(desc(prayerRequest.createdAt))
  return rows.map((r) => toView(r, viewerId))
}

function toView(row: typeof prayerRequest.$inferSelect, viewerId: string | null): PrayerRequestView {
  return {
    id: row.id,
    authorName: row.authorName,
    body: row.body,
    isAnonymous: row.isAnonymous,
    prayedCount: row.prayedCount,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    isMine: Boolean(viewerId && row.userId === viewerId),
  }
}
