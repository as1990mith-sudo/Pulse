import "server-only"

import { and, count, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getAdminActor } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { home, homeMembership, organization, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { orgCategoryLabel } from "@/lib/org-types"
import { homeRoleHasPermission, type HomePermission, type HomeRole } from "@/lib/home/roles"
import type { HomeJoinPolicy, HomeMembershipView, HomeView } from "@/lib/home/types"
import type { HomePlanId } from "@/lib/home/plans"

type HomeRow = typeof home.$inferSelect
type OrgRow = typeof organization.$inferSelect

/**
 * Short-lived cookie the "start from Home" entry sets before opening the global
 * go-live composer. `startBroadcast` reads it (once) to stamp the new session
 * with its Home, so we get exact Home scoping without threading a prop through
 * the entire immersive live stack.
 */
export const HOME_GO_LIVE_COOKIE = "freq_home_live"

export async function getViewerId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

/**
 * Whether the current viewer is allowed to start a live session. True for
 * platform admins/staff (site-wide), OR for anyone who holds the `live.manage`
 * permission in ANY Home they actively belong to — i.e. an organisation
 * owner/administrator/content-manager. This is the single source of truth used
 * by the Live tab, the studio page, and the startBroadcast server action so all
 * three agree on who can go live.
 */
export async function canViewerGoLive(): Promise<boolean> {
  const [actor, viewerId] = await Promise.all([getAdminActor(), getViewerId()])
  if (actor) return true
  if (!viewerId) return false
  const rows = await db
    .select({ role: homeMembership.role })
    .from(homeMembership)
    .where(and(eq(homeMembership.userId, viewerId), eq(homeMembership.status, "active")))
  return rows.some((r) => homeRoleHasPermission(r.role as HomeRole, "live.manage"))
}

/**
 * The Home this viewer publishes community events on behalf of — the first Home
 * (newest membership) where they hold `events.manage` (owner / administrator /
 * content-manager). Community events are stamped with this Home so their
 * attendance shows up in that Home's admin console. Returns null for members
 * with no event-management rights anywhere.
 */
export async function getViewerEventHome(): Promise<{
  homeId: string
  organizationId: string
  handle: string
  orgName: string
} | null> {
  const viewerId = await getViewerId()
  if (!viewerId) return null
  const rows = await db
    .select({ h: home, org: organization, role: homeMembership.role })
    .from(homeMembership)
    .innerJoin(home, eq(home.id, homeMembership.homeId))
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(and(eq(homeMembership.userId, viewerId), eq(homeMembership.status, "active")))
    .orderBy(desc(homeMembership.createdAt))
  for (const r of rows) {
    if (homeRoleHasPermission(r.role as HomeRole, "events.manage")) {
      return { homeId: r.h.id, organizationId: r.org.id, handle: r.org.handle, orgName: r.org.name }
    }
  }
  return null
}

/** Whether the viewer may publish a community event (i.e. manages a Home). */
export async function canViewerManageEvents(): Promise<boolean> {
  return (await getViewerEventHome()) !== null
}

async function memberCountFor(homeId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.status, "active")))
  return Number(rows[0]?.value ?? 0)
}

function toHomeView(h: HomeRow, org: OrgRow, memberCount: number): HomeView {
  return {
    id: h.id,
    organizationId: h.organizationId,
    name: h.name,
    handle: org.handle,
    plan: h.plan as HomePlanId,
    planStatus: h.planStatus,
    accentColor: h.accentColor,
    joinPolicy: h.joinPolicy as HomeJoinPolicy,
    status: h.status,
    orgName: org.name,
    orgLogo: org.logo,
    orgCover: org.cover,
    orgDescription: org.description,
    orgCategoryLabel: orgCategoryLabel(org.category, org.categoryOther),
    orgInitials: getInitials(org.name),
    orgColor: getAvatarColor(org.id),
    memberCount,
    createdAt: h.createdAt.toISOString(),
  }
}

/** Resolves a Home + its organisation by the organisation handle. */
export async function getHomeByHandle(handle: string): Promise<HomeView | null> {
  const rows = await db
    .select({ h: home, org: organization })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(eq(organization.handle, handle))
    .limit(1)
  if (rows.length === 0) return null
  const memberCount = await memberCountFor(rows[0].h.id)
  return toHomeView(rows[0].h, rows[0].org, memberCount)
}

/** Resolves the Home owned/linked to a specific organisation id. */
export async function getHomeByOrganizationId(organizationId: string): Promise<HomeView | null> {
  const rows = await db
    .select({ h: home, org: organization })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(eq(home.organizationId, organizationId))
    .limit(1)
  if (rows.length === 0) return null
  const memberCount = await memberCountFor(rows[0].h.id)
  return toHomeView(rows[0].h, rows[0].org, memberCount)
}

/** A public-safe member entry for the org hero "Members" roster popup. */
export type HomeRosterMember = {
  userId: string
  name: string
  image: string | null
  initials: string
  color: string
  role: HomeRole
  isOwner: boolean
}

/**
 * The active-member roster for the Home linked to an organisation, owner first.
 * Public-safe (name + avatar only, no email) so it can power the "N Members"
 * popup on the public org profile. Returns [] when the org has no Home.
 */
export async function getHomeRosterByOrg(organizationId: string): Promise<HomeRosterMember[]> {
  const [h] = await db
    .select({ id: home.id })
    .from(home)
    .where(eq(home.organizationId, organizationId))
    .limit(1)
  if (!h) return []
  const rows = await db
    .select({ m: homeMembership, u: userTable })
    .from(homeMembership)
    .innerJoin(userTable, eq(userTable.id, homeMembership.userId))
    .where(and(eq(homeMembership.homeId, h.id), eq(homeMembership.status, "active")))
    .orderBy(desc(homeMembership.createdAt))
  return rows
    .map(({ m, u }) => ({
      userId: m.userId,
      name: u.name,
      image: u.image,
      initials: getInitials(u.name),
      color: getAvatarColor(u.id),
      role: m.role as HomeRole,
      isOwner: m.role === "owner",
    }))
    .sort((a, b) => (a.isOwner === b.isOwner ? 0 : a.isOwner ? -1 : 1))
}

/** Every Home the current user is an ACTIVE member of, newest membership first. */
export async function getMyHomes(): Promise<HomeView[]> {
  const viewerId = await getViewerId()
  if (!viewerId) return []
  const rows = await db
    .select({ h: home, org: organization })
    .from(homeMembership)
    .innerJoin(home, eq(home.id, homeMembership.homeId))
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(and(eq(homeMembership.userId, viewerId), eq(homeMembership.status, "active")))
    .orderBy(desc(homeMembership.createdAt))
  return Promise.all(rows.map(async (r) => toHomeView(r.h, r.org, await memberCountFor(r.h.id))))
}

/**
 * Whether a specific user is an ACTIVE member of a Home. A lightweight boolean
 * check (no view assembly) for server actions that have already resolved the
 * acting user and just need to gate access — e.g. joining a Home-scoped live
 * session, or stamping a session with its Home on go-live.
 */
export async function isActiveHomeMember(homeId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: homeMembership.id })
    .from(homeMembership)
    .where(
      and(
        eq(homeMembership.homeId, homeId),
        eq(homeMembership.userId, userId),
        eq(homeMembership.status, "active"),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/** The current viewer's membership in a Home, or null if none. */
export async function getViewerMembership(homeId: string): Promise<HomeMembershipView> {
  const viewerId = await getViewerId()
  if (!viewerId) return null
  const rows = await db
    .select()
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.userId, viewerId)))
    .limit(1)
  if (rows.length === 0) return null
  return {
    role: rows[0].role as HomeRole,
    status: rows[0].status as "active" | "pending",
    joinedVia: rows[0].joinedVia,
  }
}

/**
 * Guards a private Home surface: the Home must exist and the viewer must be an
 * ACTIVE member. Non-members are sent to the join flow — this is the core
 * privacy boundary (Organisation A members never see Organisation B's Home).
 */
export async function requireHomeMembership(
  handle: string,
): Promise<{ home: HomeView; membership: NonNullable<HomeMembershipView> }> {
  const viewerId = await getViewerId()
  if (!viewerId) redirect("/sign-in")
  const home = await getHomeByHandle(handle)
  if (!home) notFound()
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active") {
    redirect(`/home/join?to=${encodeURIComponent(handle)}`)
  }
  return { home, membership }
}

/**
 * Guards a Home Admin surface: active membership PLUS a management permission.
 * Members without the permission are bounced to the Home overview.
 */
export async function requireHomePermission(
  handle: string,
  permission: HomePermission,
): Promise<{ home: HomeView; membership: NonNullable<HomeMembershipView> }> {
  const { home, membership } = await requireHomeMembership(handle)
  if (!homeRoleHasPermission(membership.role, permission)) {
    redirect(`/home/${handle}`)
  }
  return { home, membership }
}
