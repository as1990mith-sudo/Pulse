"use server"

import { gt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { onlinePresence } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"

// A user is considered "online now" only while their heartbeat is fresher than
// this window. Kept just above the client heartbeat interval (~25s) so a single
// missed ping doesn't drop someone, while genuinely-gone users age out fast.
const ONLINE_WINDOW_SECONDS = 60

/**
 * Records that the signed-in user is currently active. Called on a short
 * interval by the client while the tab is visible. No-op for signed-out users.
 */
export async function heartbeat(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  await db
    .insert(onlinePresence)
    .values({ userId: user.id, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: onlinePresence.userId, set: { lastSeenAt: new Date() } })
}

/** Number of distinct users with a fresh heartbeat (true real-time presence). */
export async function getOnlineCount(): Promise<number> {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000)
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(onlinePresence)
    .where(gt(onlinePresence.lastSeenAt, cutoff))
  return Number(row?.count ?? 0)
}
