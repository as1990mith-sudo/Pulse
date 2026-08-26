import "server-only"

import { cache } from "react"
import { and, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { getAdminActor } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { homeMembership } from "@/lib/db/schema"
import { getMyHomes, getViewerMembership } from "@/lib/home/access"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import type { HomeView, HomeMembershipView } from "@/lib/home/types"

/**
 * The active-Home context is the backbone of Frequency Home. A single Frequency
 * identity belongs to many Homes, but at any moment the member is "inside" ONE
 * Home. That selection lives in this cookie so every Home-scoped surface — feed,
 * articles, live, events, notifications, admin — resolves the same organisation
 * context without threading a handle through every route.
 */
export const ACTIVE_HOME_COOKIE = "freq_active_home"

/**
 * Cookie sentinel for Personal mode. A user who belongs to Homes must still be
 * able to act purely as themselves — post under their own name, see their own
 * profile, and have no Home admin controls anywhere on screen. Personal mode is
 * therefore a real, explicitly selectable context, not merely the absence of a
 * Home, which is why it needs a sentinel the cookie can hold.
 */
export const PERSONAL_CONTEXT = "__personal"

export type ActiveHomeContext = {
  /** The resolved active Home. Null in personal mode, or with no Homes at all. */
  home: HomeView | null
  /** The viewer's membership within the active Home (role/status). */
  membership: NonNullable<HomeMembershipView> | null
  /** Every Home the viewer actively belongs to (for the My Homes switcher). */
  homes: HomeView[]
  /**
   * Distinguishes the two `home === null` cases: "personal" means the viewer
   * deliberately chose to act as themselves, "home" means a Home is active (or
   * they have none yet). Callers that must not silently treat Personal mode as
   * "no Home selected" check this.
   */
  mode: "home" | "personal"
}

/**
 * Resolves the viewer's current context.
 *
 * Selection order:
 *  1. The `__personal` sentinel — the viewer explicitly chose Personal mode.
 *  2. The Home whose handle matches the `freq_active_home` cookie — but only if
 *     the viewer is still an active member (memberships can be revoked).
 *  3. Otherwise the most recently joined Home (first of `getMyHomes`).
 *  4. Otherwise null — the viewer has no Homes and should see onboarding.
 *
 * This never trusts the cookie blindly: an orphaned/foreign handle silently
 * falls back rather than leaking another organisation's context.
 */
export const getActiveHomeContext = cache(async function getActiveHomeContext(): Promise<ActiveHomeContext> {
  const store = await cookies()
  const preferred = store.get(ACTIVE_HOME_COOKIE)?.value

  // Personal mode is resolved before Homes are even loaded: the viewer is acting
  // as themselves, so no Home context applies regardless of what they belong to.
  if (preferred === PERSONAL_CONTEXT) {
    return { home: null, membership: null, homes: await getMyHomes(), mode: "personal" }
  }

  const homes = await getMyHomes()
  if (homes.length === 0) {
    return { home: null, membership: null, homes: [], mode: "home" }
  }

  const selected = (preferred && homes.find((h) => h.handle === preferred)) || homes[0]
  const membership = await getViewerMembership(selected.id)

  return { home: selected, membership, homes, mode: "home" }
})

/** Convenience: just the active Home (or null), without the full context. */
export async function getActiveHome(): Promise<HomeView | null> {
  const { home } = await getActiveHomeContext()
  return home
}

/**
 * Whether the viewer may start a live session. Platform admins/staff can always
 * go live; everyone else needs `live.manage` in the Home that is active RIGHT
 * NOW.
 *
 * The scoping is the whole point. This previously returned true if the viewer
 * held `live.manage` in ANY Home, which handed a plain member of Grace Community
 * full Live powers there purely because they administer Kingdom Academy. Rights
 * belong to a Home, so they are read from that Home's membership row only.
 */
export async function canViewerGoLive(): Promise<boolean> {
  const actor = await getAdminActor()
  if (actor) return true
  const { home, membership, mode } = await getActiveHomeContext()
  // Personal mode is a deliberate step outside every Home, so no Home-granted
  // broadcast rights apply.
  if (mode === "personal" || !home) return false
  if (membership?.status !== "active") return false
  return homeRoleHasPermission(membership.role as HomeRole, "live.manage")
}

/**
 * The Home the viewer publishes community events on behalf of: the ACTIVE Home,
 * and only when they hold `events.manage` there. Events are stamped with it so
 * attendance lands in that Home's admin console.
 *
 * Returns null when the active Home doesn't grant the right — even if the viewer
 * manages events in a different Home. Previously this scanned every membership
 * and took the first match, so events could be filed against a Home the user
 * wasn't even looking at.
 */
export async function getViewerEventHome(): Promise<{
  homeId: string
  organizationId: string
  handle: string
  orgName: string
} | null> {
  const { home, membership, mode } = await getActiveHomeContext()
  if (mode === "personal" || !home) return null
  if (membership?.status !== "active") return null
  if (!homeRoleHasPermission(membership.role as HomeRole, "events.manage")) return null
  return { homeId: home.id, organizationId: home.organizationId, handle: home.handle, orgName: home.orgName }
}

/** Whether the viewer may publish a community event in their active Home. */
export async function canViewerManageEvents(): Promise<boolean> {
  return (await getViewerEventHome()) !== null
}

/**
 * The single source of truth for "members-only" scoping across every Home
 * surface (feed, articles, chatroom, messaging). Resolves the viewer's active
 * Home and the ids of its ACTIVE members (admins included). With no active Home,
 * or a Home with no active members, `memberIds` is empty — callers treat that as
 * "nothing to show", so a viewer can only ever see content from people who
 * actually belong to the Home they are currently inside.
 */
export const getActiveHomeMemberIds = cache(async function getActiveHomeMemberIds(): Promise<{
  home: HomeView | null
  memberIds: string[]
}> {
  const { home } = await getActiveHomeContext()
  if (!home) return { home: null, memberIds: [] }
  const rows = await db
    .select({ userId: homeMembership.userId })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, home.id), eq(homeMembership.status, "active")))
  return { home, memberIds: rows.map((r) => r.userId) }
})
