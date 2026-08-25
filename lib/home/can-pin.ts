// Who may pin a post, and how many pins a feed may carry.
//
// Shared by the main feed (app/actions/feed.ts) and Community Help
// (app/actions/community.ts) so the two surfaces can never drift apart on the
// authorisation rule — the whole point of pinning being an admin capability is
// that it is enforced identically everywhere.

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { getViewerMembership } from "@/lib/home/access"
import { homeRoleHasPermission } from "@/lib/home/roles"
import { getAdminUser } from "@/lib/admin"

/**
 * The most pins a single feed scope may carry at once.
 *
 * Pinning floats a post above everything else, so an uncapped pin list would let
 * an admin bury the actual feed under announcements. Three is enough for
 * "notice + event + welcome" while keeping real content on the first screen.
 */
export const MAX_PINNED_PER_SCOPE = 3

/**
 * Can the current viewer pin/unpin inside this feed scope?
 *
 * - Platform staff (ADMIN_EMAILS) can pin anywhere, including the Universal
 *   feeds, since they are the only administrators those surfaces have.
 * - Otherwise the viewer must be an ACTIVE member of `homeId` holding
 *   `community.moderate` — the permission that already governs moderating the
 *   private feed and Community Help, so pinning needs no new permission key and
 *   automatically follows any future change to who moderates a Home.
 *
 * `homeId === null` is the Universal/personal scope, which has no Home admin to
 * delegate to, so only platform staff qualify there.
 */
export async function canPinInScope(homeId: string | null): Promise<boolean> {
  // Checked first: staff authority does not depend on Home membership, and this
  // is also the only path that can pin in the Universal scope.
  const staff = await getAdminUser()
  if (staff) return true

  if (!homeId) return false

  const membership = await getViewerMembership(homeId)
  if (!membership || membership.status !== "active") return false
  return homeRoleHasPermission(membership.role, "community.moderate")
}

/**
 * Pins one post, enforcing MAX_PINNED_PER_SCOPE atomically. Returns false when
 * the feed is already at the cap (the caller turns that into a user-facing
 * message) and true when the pin was applied.
 *
 * Why a lock rather than a conditional UPDATE with a counting subquery: under
 * READ COMMITTED, concurrent statements each read a snapshot taken BEFORE their
 * siblings commit, so every one of them sees "only 2 pinned" and they all pass.
 * Verified against Postgres — five simultaneous pins produced five pins. A
 * transaction-scoped advisory lock keyed on the feed scope serialises just the
 * attempts that could conflict, and releases automatically on commit/rollback so
 * a failure can never leave the scope wedged.
 *
 * @param table  Physical table name — only ever called with the two literals
 *               below, never with user input.
 */
export async function pinWithinCap(
  table: "feed_post" | "community_post",
  postId: number,
  homeId: string | null,
  userId: string,
): Promise<boolean> {
  const tableRef = sql.identifier(table)
  const scope = homeId ? sql`"homeId" = ${homeId}` : sql`"homeId" is null`

  return db.transaction(async (tx) => {
    // Same key for every writer in this scope, so pins in different Homes (and
    // in the two different feeds) never block one another.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pin:${table}:${homeId ?? "__global"}`}))`)

    const counted = await tx.execute(
      sql`select count(*)::int as n from ${tableRef} where ${scope} and "pinnedAt" is not null and "deleted" = false`,
    )
    if (Number(counted.rows[0]?.n ?? 0) >= MAX_PINNED_PER_SCOPE) return false

    const updated = await tx.execute(
      sql`update ${tableRef} set "pinnedAt" = now(), "pinnedBy" = ${userId}
           where "id" = ${postId} and "pinnedAt" is null
        returning "id"`,
    )
    return updated.rows.length > 0
  })
}
