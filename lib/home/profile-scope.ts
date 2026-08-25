import "server-only"

import { eq, isNull } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { getActiveHomeContext } from "@/lib/home/active-home"

/**
 * The context a member's social activity is being READ in.
 *
 * Frequency deliberately models one account as many Home identities:
 *
 *     User Account
 *       -> Home A identity/activity
 *       -> Home B identity/activity
 *       -> Personal identity/activity
 *
 * NOT one combined activity stream. A profile is therefore always "this person
 * WITHIN this Home", never "everything this person has ever done on Frequency".
 * Two members of Home A looking at the same profile must see the same Home A
 * activity, and neither may see that person's Home B activity — including the
 * profile owner themselves, so the surface a member sees matches what everyone
 * else in that Home sees.
 */
export type ProfileScope = {
  /** The Home whose activity is in view. Null in Personal mode. */
  homeId: string | null
  /** Display name of the Home in view, for the profile's context line. */
  homeName: string | null
  /** Handle of the Home in view, for linking to the Home profile. */
  homeHandle: string | null
  /**
   * The Home's branding, so a context line can render the same mark the My
   * Homes switcher shows. `homeLogo` may be null, in which case initials on the
   * accent colour are the fallback — mirroring <HomeCard>.
   */
  homeLogo: string | null
  homeInitials: string
  homeColor: string
  /**
   * "personal" means the viewer is deliberately outside every Home, so only
   * activity that belongs to no Home is in scope.
   */
  mode: "home" | "personal"
}

/**
 * Resolves the Home context a profile should be read in. This is intentionally
 * derived from the ACTIVE Home rather than passed in by the caller: the active
 * Home is the only filter, so a profile can never be coaxed into showing another
 * Home's activity by URL manipulation, and switching Homes re-scopes every
 * profile automatically with no per-profile selector to keep in sync.
 */
export async function getProfileScope(): Promise<ProfileScope> {
  const { home, mode } = await getActiveHomeContext()
  return {
    homeId: home?.id ?? null,
    homeName: home?.orgName ?? null,
    homeHandle: home?.handle ?? null,
    homeLogo: home?.orgLogo ?? null,
    homeInitials: home?.orgInitials ?? "",
    homeColor: home?.orgColor ?? "var(--muted)",
    mode,
  }
}

/**
 * The SQL predicate that confines a query to the scope's Home.
 *
 * Pass the `homeId` column of whichever activity table is being read
 * (feedPost/communityPost/article all carry one). With no Home in scope the
 * predicate matches only rows that belong to NO Home, so Personal mode shows
 * genuinely personal activity instead of silently falling back to "everything" —
 * an `undefined` here would drop the filter from the `and(...)` and leak every
 * Home's content, which is exactly the bug this helper exists to prevent.
 */
export function scopeToHome(column: AnyPgColumn, scope: ProfileScope) {
  return scope.homeId ? eq(column, scope.homeId) : isNull(column)
}
