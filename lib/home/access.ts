import "server-only"

import { and, count, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { home, homeMembership, organization } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { orgCategoryLabel } from "@/lib/org-types"
import { homeRoleHasPermission, type HomePermission, type HomeRole } from "@/lib/home/roles"
import type { HomeJoinPolicy, HomeMembershipView, HomeView } from "@/lib/home/types"
import type { HomePlanId } from "@/lib/home/plans"

type HomeRow = typeof home.$inferSelect
type OrgRow = typeof organization.$inferSelect

export async function getViewerId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
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
