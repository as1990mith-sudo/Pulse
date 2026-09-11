// Server-only enforcement for Home-scoped member suspensions.
//
// A suspension is an overlay on the member's home_membership row (suspendedAt /
// suspendedUntil), NOT a change to their membership status — they remain a
// member and keep read access; only participation is blocked. This is Home-
// scoped: it never touches the user's Frequency account or other Homes.
//
// The suspension auto-expires: once suspendedUntil is in the past the guard
// passes again without any cron sweep. An indefinite suspension has a null
// suspendedUntil and stays active until an admin lifts it.

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { homeMembership } from "@/lib/db/schema"
import { isSuspensionActive } from "@/lib/home/moderation"

export type ActiveSuspension = {
  until: Date | null // null = indefinite
  reason: string | null
}

/** Returns the caller's active suspension in `homeId`, or null when free to participate. */
export async function getActiveSuspension(
  homeId: string | null | undefined,
  userId: string | null | undefined,
): Promise<ActiveSuspension | null> {
  if (!homeId || !userId) return null
  const [row] = await db
    .select({
      suspendedAt: homeMembership.suspendedAt,
      suspendedUntil: homeMembership.suspendedUntil,
      suspendedReason: homeMembership.suspendedReason,
    })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.userId, userId)))
  if (!row) return null
  if (!isSuspensionActive(row.suspendedAt, row.suspendedUntil)) return null
  return { until: row.suspendedUntil ?? null, reason: row.suspendedReason ?? null }
}

/** Throws a member-facing error when the caller is suspended in `homeId`. */
export async function assertNotSuspended(
  homeId: string | null | undefined,
  userId: string | null | undefined,
): Promise<void> {
  const s = await getActiveSuspension(homeId, userId)
  if (!s) return
  if (!s.until) {
    throw new Error("Your participation in this Home is currently suspended.")
  }
  throw new Error(
    `Your participation in this Home is suspended until ${s.until.toLocaleString()}.`,
  )
}
