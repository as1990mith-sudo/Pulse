import "server-only"

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { homeBroadcast, homeBroadcastRecipient } from "@/lib/db/schema"
import type { BroadcastMessageView } from "@/lib/home/broadcast"

/**
 * The Home Broadcast conversation as it appears in a member's inbox — derived,
 * never a stored thread. One "conversation" per (Home, member): every broadcast
 * that member received in the active Home, collapsed to a single inbox row.
 * `unreadCount > 0` is what pins it to the top until they open it.
 */
export type ViewerBroadcastSummary = {
  lastMessage: string
  lastSentAt: Date
  unreadCount: number
}

/**
 * The inbox summary for one member within one Home. Returns null when the Home
 * has never broadcast to them, so the inbox simply omits the row. The preview
 * shows the newest broadcast; the unread count spans every unopened one.
 */
export async function getViewerBroadcastSummary(
  homeId: string,
  userId: string,
): Promise<ViewerBroadcastSummary | null> {
  const [latest] = await db
    .select({ message: homeBroadcast.message, sentAt: homeBroadcastRecipient.sentAt })
    .from(homeBroadcastRecipient)
    .innerJoin(homeBroadcast, eq(homeBroadcast.id, homeBroadcastRecipient.broadcastId))
    .where(and(eq(homeBroadcastRecipient.userId, userId), eq(homeBroadcastRecipient.homeId, homeId)))
    .orderBy(desc(homeBroadcastRecipient.sentAt))
    .limit(1)

  if (!latest) return null

  const [counts] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(homeBroadcastRecipient)
    .where(
      and(
        eq(homeBroadcastRecipient.userId, userId),
        eq(homeBroadcastRecipient.homeId, homeId),
        isNull(homeBroadcastRecipient.openedAt),
      ),
    )

  return { lastMessage: latest.message, lastSentAt: latest.sentAt, unreadCount: counts?.unread ?? 0 }
}

/**
 * The full Home Broadcast thread for a member in one Home, oldest first — the
 * complete chronological history, exactly what the dedicated thread page renders.
 */
export async function getViewerBroadcastThread(homeId: string, userId: string): Promise<BroadcastMessageView[]> {
  const rows = await db
    .select({
      id: homeBroadcast.id,
      message: homeBroadcast.message,
      attachmentUrl: homeBroadcast.attachmentUrl,
      attachmentType: homeBroadcast.attachmentType,
      attachmentName: homeBroadcast.attachmentName,
      sentAt: homeBroadcastRecipient.sentAt,
    })
    .from(homeBroadcastRecipient)
    .innerJoin(homeBroadcast, eq(homeBroadcast.id, homeBroadcastRecipient.broadcastId))
    .where(and(eq(homeBroadcastRecipient.userId, userId), eq(homeBroadcastRecipient.homeId, homeId)))
    .orderBy(asc(homeBroadcastRecipient.sentAt))

  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    attachmentUrl: r.attachmentUrl,
    attachmentType: r.attachmentType,
    attachmentName: r.attachmentName,
    sentAt: r.sentAt.toISOString(),
  }))
}

/**
 * Clears the unread/priority state for a member's Home Broadcasts in one Home —
 * called when they open the thread. Only unopened rows are touched, so an
 * already-read broadcast keeps its original openedAt (accurate per-recipient
 * analytics for the admin). Returns how many were newly marked opened.
 */
export async function markViewerBroadcastsOpened(homeId: string, userId: string): Promise<number> {
  const rows = await db
    .update(homeBroadcastRecipient)
    .set({ openedAt: new Date(), status: "opened" })
    .where(
      and(
        eq(homeBroadcastRecipient.userId, userId),
        eq(homeBroadcastRecipient.homeId, homeId),
        isNull(homeBroadcastRecipient.openedAt),
      ),
    )
    .returning({ id: homeBroadcastRecipient.id })

  return rows.length
}
