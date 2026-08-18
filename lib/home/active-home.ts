import "server-only"

import { and, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { homeMembership } from "@/lib/db/schema"
import { getMyHomes, getViewerMembership } from "@/lib/home/access"
import type { HomeView, HomeMembershipView } from "@/lib/home/types"

/**
 * The active-Home context is the backbone of Frequency Home. A single Frequency
 * identity belongs to many Homes, but at any moment the member is "inside" ONE
 * Home. That selection lives in this cookie so every Home-scoped surface — feed,
 * articles, live, events, notifications, admin — resolves the same organisation
 * context without threading a handle through every route.
 */
export const ACTIVE_HOME_COOKIE = "freq_active_home"

export type ActiveHomeContext = {
  /** The resolved active Home, or null if the viewer belongs to none. */
  home: HomeView | null
  /** The viewer's membership within the active Home (role/status). */
  membership: NonNullable<HomeMembershipView> | null
  /** Every Home the viewer actively belongs to (for the My Homes switcher). */
  homes: HomeView[]
}

/**
 * Resolves the viewer's current Home context.
 *
 * Selection order:
 *  1. The Home whose handle matches the `freq_active_home` cookie — but only if
 *     the viewer is still an active member (memberships can be revoked).
 *  2. Otherwise the most recently joined Home (first of `getMyHomes`).
 *  3. Otherwise null — the viewer has no Homes and should see onboarding.
 *
 * This never trusts the cookie blindly: an orphaned/foreign handle silently
 * falls back rather than leaking another organisation's context.
 */
export async function getActiveHomeContext(): Promise<ActiveHomeContext> {
  const homes = await getMyHomes()
  if (homes.length === 0) {
    return { home: null, membership: null, homes: [] }
  }

  const store = await cookies()
  const preferred = store.get(ACTIVE_HOME_COOKIE)?.value

  const selected = (preferred && homes.find((h) => h.handle === preferred)) || homes[0]
  const membership = await getViewerMembership(selected.id)

  return { home: selected, membership, homes }
}

/** Convenience: just the active Home (or null), without the full context. */
export async function getActiveHome(): Promise<HomeView | null> {
  const { home } = await getActiveHomeContext()
  return home
}

/**
 * The single source of truth for "members-only" scoping across every Home
 * surface (feed, articles, chatroom, messaging). Resolves the viewer's active
 * Home and the ids of its ACTIVE members (admins included). With no active Home,
 * or a Home with no active members, `memberIds` is empty — callers treat that as
 * "nothing to show", so a viewer can only ever see content from people who
 * actually belong to the Home they are currently inside.
 */
export async function getActiveHomeMemberIds(): Promise<{ home: HomeView | null; memberIds: string[] }> {
  const { home } = await getActiveHomeContext()
  if (!home) return { home: null, memberIds: [] }
  const rows = await db
    .select({ userId: homeMembership.userId })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, home.id), eq(homeMembership.status, "active")))
  return { home, memberIds: rows.map((r) => r.userId) }
}
