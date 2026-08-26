import { cache } from "react"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { organization, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"

export type CurrentUserOrg = {
  id: string
  handle: string
  name: string
  logo: string | null
  verified: boolean
}

export type CurrentUser = {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  image: string | null
  // "individual" (normal user) or "organization" (church/ministry account).
  accountType: "individual" | "organization"
  // The organisation this account owns, if accountType === "organization".
  organization: CurrentUserOrg | null
  // The host's last-used immersive live theme (preset id or custom image URL),
  // used to seed a new broadcast's backdrop. Null until they first choose one.
  preferredLiveTheme: string | null
}

/**
 * Returns the signed-in user (with derived handle + initials), or null.
 *
 * Wrapped in React `cache()` so it runs AT MOST ONCE per request. There are ~40
 * call sites (layout, header, page, nested server components, actions) and each
 * call previously issued its own session lookup plus one or two user/org
 * queries. On a single page render that stacked up into dozens of sequential
 * round trips before any HTML was flushed, which is what made pages feel like
 * they were hanging rather than loading. `cache()` is per-request and per-render,
 * so this changes timing only — never correctness, and never leaks one viewer's
 * identity into another's request.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  // Treat any failure (no session, or the auth/session lookup erroring because
  // the database is unreachable) as "logged out" rather than throwing, so a
  // transient DB outage doesn't crash every page that reads the current user.
  let session
  try {
    session = await auth.api.getSession({ headers: await headers() })
  } catch (err) {
    console.error("[v0] getCurrentUser session lookup failed:", err)
    return null
  }
  if (!session?.user) return null

  // Resolve account type + owned organisation. Wrapped so a DB hiccup degrades
  // to a plain individual identity rather than crashing the page.
  let accountType: "individual" | "organization" = "individual"
  let org: CurrentUserOrg | null = null
  let preferredLiveTheme: string | null = null
  try {
    const [row] = await db
      .select({ accountType: userTable.accountType, preferredLiveTheme: userTable.preferredLiveTheme })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1)
    if (row?.accountType === "organization") accountType = "organization"
    preferredLiveTheme = row?.preferredLiveTheme ?? null

    if (accountType === "organization") {
      const [o] = await db
        .select({
          id: organization.id,
          handle: organization.handle,
          name: organization.name,
          logo: organization.logo,
          verified: organization.verified,
        })
        .from(organization)
        .where(eq(organization.ownerId, session.user.id))
        .limit(1)
      if (o) org = o
    }
  } catch (err) {
    console.error("[v0] getCurrentUser account-type lookup failed:", err)
  }

  return {
    id: session.user.id,
    name: session.user.name,
    handle: getHandle(session.user.name),
    initials: getInitials(session.user.name),
    color: getAvatarColor(session.user.id),
    image: session.user.image ?? null,
    accountType,
    organization: org,
    preferredLiveTheme,
  }
})
