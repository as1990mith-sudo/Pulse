"use server"

import { and, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { home, homeMembership, organization } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { orgCategoryLabel } from "@/lib/org-types"
import { DEFAULT_HOME_ACCENT } from "@/lib/home/accent"
import type { HomeJoinPolicy, HomeMembershipStatus } from "@/lib/home/types"

// The viewer's relationship to a Home, from a discovery perspective. "none"
// means they can act on a Join CTA; "pending"/"member" means they already have
// a relationship and the UI should route to it instead of offering to join.
export type DiscoverRelation = "none" | "pending" | "member" | "owner"

// A single card in the Find a Home directory. Deliberately compact — identity,
// name, one metadata line, an action hint. No descriptions dumped here.
export type DiscoverHomeCard = {
  handle: string
  name: string
  categoryLabel: string
  logo: string | null
  cover: string | null
  initials: string
  color: string
  accent: string
  memberCount: number
  joinPolicy: HomeJoinPolicy
  relation: DiscoverRelation
}

async function getViewerId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

/**
 * The "Find a Home" directory + search. Returns ONLY discoverable, non-deleted
 * Homes. Private Homes never appear here regardless of query — the WHERE clause
 * is the single guard. An optional name query filters case-insensitively on the
 * organisation name (partial match). Results are ordered by member count so the
 * most established Homes surface first, with each card annotated with the
 * viewer's existing relationship so the UI can show "Open"/"Requested" instead
 * of "Join" where appropriate.
 */
export async function getDiscoverableHomes(query?: string): Promise<DiscoverHomeCard[]> {
  const viewerId = await getViewerId()
  const trimmed = (query ?? "").trim()

  const rows = await db
    .select({ h: home, org: organization })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(
      and(
        eq(home.discoverable, true),
        ne(home.status, "deleted"),
        trimmed.length > 0 ? ilike(organization.name, `%${trimmed}%`) : undefined,
      ),
    )
    .orderBy(desc(home.createdAt))
    .limit(60)

  if (rows.length === 0) return []

  // Batch: member counts (active only) and the viewer's memberships across the
  // candidate Homes — two queries instead of N, then joined in memory.
  const homeIds = rows.map((r) => r.h.id)

  const counts = await db
    .select({ homeId: homeMembership.homeId, count: sql<number>`count(*)::int` })
    .from(homeMembership)
    .where(and(eq(homeMembership.status, "active"), inArray(homeMembership.homeId, homeIds)))
    .groupBy(homeMembership.homeId)
  const countByHome = new Map(counts.map((c) => [c.homeId, c.count]))

  const relationByHome = new Map<string, DiscoverRelation>()
  if (viewerId) {
    const mine = await db
      .select({ homeId: homeMembership.homeId, role: homeMembership.role, status: homeMembership.status })
      .from(homeMembership)
      .where(eq(homeMembership.userId, viewerId))
    for (const m of mine) {
      if (!homeIds.includes(m.homeId)) continue
      const relation: DiscoverRelation =
        m.role === "owner" ? "owner" : m.status === "pending" ? "pending" : "member"
      relationByHome.set(m.homeId, relation)
    }
  }

  return rows
    .map(({ h, org }) => ({
      handle: org.handle,
      name: org.name,
      categoryLabel: orgCategoryLabel(org.category, org.categoryOther),
      logo: org.logo,
      cover: org.cover,
      initials: getInitials(org.name),
      color: getAvatarColor(org.id),
      accent: h.accentColor || DEFAULT_HOME_ACCENT,
      memberCount: countByHome.get(h.id) ?? 0,
      joinPolicy: h.joinPolicy as HomeJoinPolicy,
      relation: relationByHome.get(h.id) ?? "none",
    }))
    .sort((a, b) => b.memberCount - a.memberCount)
}

// The join-state a public Home profile needs to render the right CTA.
export type HomeJoinState = {
  discoverable: boolean
  joinPolicy: HomeJoinPolicy
  relation: DiscoverRelation
  membershipStatus: HomeMembershipStatus | null
}

/**
 * Resolves the viewer's join state for a single Home's public profile. Only
 * meaningful for discoverable Homes; a private Home returns discoverable:false
 * so the profile hides any discovery-driven join affordance. Signed-out viewers
 * get relation "none" (the CTA can prompt sign-in).
 */
export async function getHomeJoinState(handle: string): Promise<HomeJoinState | null> {
  const viewerId = await getViewerId()

  const rows = await db
    .select({ h: home })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(eq(organization.handle, handle))
    .limit(1)
  if (rows.length === 0) return null
  const h = rows[0].h
  if (h.status === "deleted") return null

  let relation: DiscoverRelation = "none"
  let membershipStatus: HomeMembershipStatus | null = null
  if (viewerId) {
    const mine = await db
      .select({ role: homeMembership.role, status: homeMembership.status })
      .from(homeMembership)
      .where(and(eq(homeMembership.homeId, h.id), eq(homeMembership.userId, viewerId)))
      .limit(1)
    if (mine.length > 0) {
      membershipStatus = mine[0].status === "pending" ? "pending" : "active"
      relation = mine[0].role === "owner" ? "owner" : mine[0].status === "pending" ? "pending" : "member"
    }
  }

  return {
    discoverable: h.discoverable,
    joinPolicy: h.joinPolicy as HomeJoinPolicy,
    relation,
    membershipStatus,
  }
}
