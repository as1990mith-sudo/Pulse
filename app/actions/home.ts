"use server"

import { and, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { home, homeAuthKey, homeMembership, organization, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { createOrganization, updateOrganization } from "@/app/actions/organizations"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { generateAuthKey, isValidKeyFormat, normalizeKey } from "@/lib/home/auth-key"
import { isHomePlanId, type HomePlanId } from "@/lib/home/plans"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import { getHomeOrgType } from "@/lib/home/org-types"
import type {
  HomeAuthKeyView,
  HomeJoinPolicy,
  HomeMemberRow,
  HomeMembershipStatus,
  HomeView,
} from "@/lib/home/types"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/** Loads a Home by handle and asserts the caller holds a management permission. */
async function requireHomeManager(handle: string, permission: Parameters<typeof homeRoleHasPermission>[1]) {
  const user = await requireUser()
  const homeView = await getHomeByHandle(handle)
  if (!homeView) throw new Error("Home not found.")
  const membership = await getViewerMembership(homeView.id)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, permission)) {
    throw new Error("You don't have permission to do that.")
  }
  return { user, home: homeView, membership }
}

/** Inserts a fresh active authorisation key, retrying on the rare collision. */
async function insertFreshKey(homeId: string, orgName: string, createdBy: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const key = generateAuthKey(orgName)
    try {
      await db.insert(homeAuthKey).values({ id: crypto.randomUUID(), homeId, key, active: true, createdBy })
      return key
    } catch {
      // Unique violation on `key` — try again with a new random.
    }
  }
  throw new Error("Could not generate an authorisation key. Please try again.")
}

export type CreateHomeInput = {
  orgName: string
  orgTypeId: string
  categoryOther?: string
  country?: string
  region?: string
  website?: string
  description?: string
  logo?: string
  cover?: string
  accentColor?: string
  plan: HomePlanId
  joinPolicy?: HomeJoinPolicy
}

/**
 * Creates (or links) the caller's organisation and provisions its Frequency
 * Home in one step. The caller becomes the Home Owner. Idempotent: if the
 * organisation already has a Home, returns it rather than duplicating.
 * Must run with an authenticated session (established during onboarding).
 */
export async function createHome(input: CreateHomeInput): Promise<{ handle: string }> {
  const user = await requireUser()

  const name = input.orgName.trim()
  if (!name) throw new Error("Organisation name is required.")
  const plan: HomePlanId = isHomePlanId(input.plan) ? input.plan : "premium"
  const type = getHomeOrgType(input.orgTypeId)
  const categoryOther =
    type.category === "other" ? input.categoryOther?.trim() || type.categoryOther || "Christian Organisation" : undefined

  // 1) Create/link the public organisation (also flips accountType). Reuses the
  //    existing org system so discovery, profile and catalogue all work.
  const { handle } = await createOrganization({
    name,
    category: type.category,
    categoryOther,
    description: input.description,
    logo: input.logo,
    reach: input.country ? "local" : "online_only",
    onlineOnly: !input.country,
    country: input.country,
    region: input.region,
    website: input.website,
  })

  const orgRows = await db.select().from(organization).where(eq(organization.handle, handle)).limit(1)
  const org = orgRows[0]
  if (!org) throw new Error("Could not resolve your organisation. Please try again.")

  // 2) Apply optional branding the org create step doesn't cover (cover image).
  if (input.cover) {
    await updateOrganization(org.id, { cover: input.cover })
  }

  // 3) Provision the Home (idempotent on organizationId).
  const existing = await db.select().from(home).where(eq(home.organizationId, org.id)).limit(1)
  if (existing.length > 0) {
    // Keep plan/branding in sync with the latest onboarding choice.
    await db
      .update(home)
      .set({ plan, accentColor: input.accentColor || existing[0].accentColor, updatedAt: new Date() })
      .where(eq(home.id, existing[0].id))
    return { handle }
  }

  const homeId = crypto.randomUUID()
  await db.insert(home).values({
    id: homeId,
    organizationId: org.id,
    name: `${name} Home`,
    plan,
    accentColor: input.accentColor || null,
    joinPolicy: input.joinPolicy ?? "auto",
  })

  // 4) The registering administrator becomes the initial Owner.
  await db.insert(homeMembership).values({
    id: crypto.randomUUID(),
    homeId,
    userId: user.id,
    role: "owner",
    status: "active",
    joinedVia: "created",
  })

  // 5) Generate the first Organisation Authorisation Key.
  await insertFreshKey(homeId, name, user.id)

  revalidatePath("/home")
  return { handle }
}

export type JoinHomeResult =
  | { status: "joined"; handle: string; homeName: string }
  | { status: "pending"; handle: string; homeName: string }
  | { status: "already_member"; handle: string; homeName: string }

/** An individual joins a Home by entering its authorisation key. */
export async function joinHomeByKey(rawKey: string): Promise<JoinHomeResult> {
  const user = await requireUser()
  const key = normalizeKey(rawKey)
  if (!isValidKeyFormat(key)) throw new Error("That doesn't look like a valid authorisation key.")

  const keyRows = await db
    .select()
    .from(homeAuthKey)
    .where(and(eq(homeAuthKey.key, key), eq(homeAuthKey.active, true)))
    .limit(1)
  if (keyRows.length === 0) {
    throw new Error("That key is invalid or no longer active. Ask your organisation for a current key.")
  }
  const homeId = keyRows[0].homeId

  const homeRows = await db
    .select({ h: home, org: organization })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(eq(home.id, homeId))
    .limit(1)
  if (homeRows.length === 0) throw new Error("This Home is no longer available.")
  const { h, org } = homeRows[0]

  // Already a member? Report status so the UI can route appropriately.
  const existing = await db
    .select()
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.userId, user.id)))
    .limit(1)
  if (existing.length > 0) {
    const status = existing[0].status === "pending" ? "pending" : "already_member"
    return { status, handle: org.handle, homeName: h.name }
  }

  const autoJoin = h.joinPolicy === "auto"
  await db.insert(homeMembership).values({
    id: crypto.randomUUID(),
    homeId,
    userId: user.id,
    role: "member",
    status: autoJoin ? "active" : "pending",
    joinedVia: autoJoin ? "key_auto" : "key_request",
  })

  revalidatePath("/home")
  return { status: autoJoin ? "joined" : "pending", handle: org.handle, homeName: h.name }
}

/** Owner/admin sets whether a valid key auto-joins or requires approval. */
export async function setJoinPolicy(handle: string, joinPolicy: HomeJoinPolicy) {
  const { home: homeView } = await requireHomeManager(handle, "home.manage")
  await db.update(home).set({ joinPolicy, updatedAt: new Date() }).where(eq(home.id, homeView.id))
  revalidatePath(`/home/${handle}/admin/members`)
  return { joinPolicy }
}

/**
 * Regenerates the authorisation key: marks the current active key inactive and
 * inserts a new one. Existing members are NEVER affected — only future joins.
 */
export async function regenerateAuthKey(handle: string): Promise<{ key: string }> {
  const { user, home: homeView } = await requireHomeManager(handle, "authkey.manage")
  await db
    .update(homeAuthKey)
    .set({ active: false, disabledAt: new Date() })
    .where(and(eq(homeAuthKey.homeId, homeView.id), eq(homeAuthKey.active, true)))
  const key = await insertFreshKey(homeView.id, homeView.orgName, user.id)
  revalidatePath(`/home/${handle}/admin/members`)
  return { key }
}

/** Disables the current active key without issuing a new one (closes joins). */
export async function disableAuthKey(handle: string) {
  const { home: homeView } = await requireHomeManager(handle, "authkey.manage")
  await db
    .update(homeAuthKey)
    .set({ active: false, disabledAt: new Date() })
    .where(and(eq(homeAuthKey.homeId, homeView.id), eq(homeAuthKey.active, true)))
  revalidatePath(`/home/${handle}/admin/members`)
  return { ok: true }
}

/** Returns the current active key for admin display (view/copy). */
export async function getActiveAuthKey(handle: string): Promise<HomeAuthKeyView | null> {
  const { home: homeView } = await requireHomeManager(handle, "authkey.manage")
  const rows = await db
    .select()
    .from(homeAuthKey)
    .where(and(eq(homeAuthKey.homeId, homeView.id), eq(homeAuthKey.active, true)))
    .orderBy(desc(homeAuthKey.createdAt))
    .limit(1)
  if (rows.length === 0) return null
  return { id: rows[0].id, key: rows[0].key, active: rows[0].active, createdAt: rows[0].createdAt.toISOString() }
}

/** Full member list for the admin Members table. */
export async function getHomeMembers(handle: string): Promise<HomeMemberRow[]> {
  const { user, home: homeView } = await requireHomeManager(handle, "members.view")
  const rows = await db
    .select({ m: homeMembership, u: userTable })
    .from(homeMembership)
    .innerJoin(userTable, eq(userTable.id, homeMembership.userId))
    .where(eq(homeMembership.homeId, homeView.id))
    .orderBy(desc(homeMembership.createdAt))
  return rows.map(({ m, u }) => ({
    id: m.id,
    userId: m.userId,
    name: u.name,
    email: u.email,
    image: u.image,
    initials: getInitials(u.name),
    color: getAvatarColor(u.id),
    role: m.role as HomeRole,
    status: m.status as HomeMembershipStatus,
    joinedVia: m.joinedVia,
    joinedAt: m.createdAt.toISOString(),
    isViewer: m.userId === user.id,
  }))
}

/** Approve a pending member (approval join policy). */
export async function approveMember(handle: string, membershipId: string) {
  const { home: homeView } = await requireHomeManager(handle, "members.manage")
  await db
    .update(homeMembership)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(homeMembership.id, membershipId), eq(homeMembership.homeId, homeView.id)))
  revalidatePath(`/home/${handle}/admin/members`)
  return { ok: true }
}

/** Remove a member. The Owner cannot be removed. */
export async function removeMember(handle: string, membershipId: string) {
  const { home: homeView } = await requireHomeManager(handle, "members.manage")
  const rows = await db
    .select()
    .from(homeMembership)
    .where(and(eq(homeMembership.id, membershipId), eq(homeMembership.homeId, homeView.id)))
    .limit(1)
  if (rows.length === 0) return { ok: true }
  if (rows[0].role === "owner") throw new Error("The Home owner cannot be removed.")
  await db.delete(homeMembership).where(eq(homeMembership.id, membershipId))
  revalidatePath(`/home/${handle}/admin/members`)
  return { ok: true }
}

/** Change a member's role. Ownership cannot be assigned or removed here. */
export async function updateMemberRole(handle: string, membershipId: string, role: HomeRole) {
  const { home: homeView } = await requireHomeManager(handle, "members.manage")
  if (role === "owner") throw new Error("Ownership can't be assigned from here.")
  const rows = await db
    .select()
    .from(homeMembership)
    .where(and(eq(homeMembership.id, membershipId), eq(homeMembership.homeId, homeView.id)))
    .limit(1)
  if (rows.length === 0) throw new Error("Member not found.")
  if (rows[0].role === "owner") throw new Error("The owner's role can't be changed.")
  await db
    .update(homeMembership)
    .set({ role, updatedAt: new Date() })
    .where(eq(homeMembership.id, membershipId))
  revalidatePath(`/home/${handle}/admin/members`)
  return { ok: true }
}

/** Update Home branding (accent colour) + linked organisation logo/cover. */
export async function updateHomeBranding(
  handle: string,
  input: { accentColor?: string | null; logo?: string | null; cover?: string | null },
) {
  const { home: homeView } = await requireHomeManager(handle, "home.manage")
  if (input.accentColor !== undefined) {
    await db.update(home).set({ accentColor: input.accentColor, updatedAt: new Date() }).where(eq(home.id, homeView.id))
  }
  const orgPatch: { logo?: string | null; cover?: string | null } = {}
  if (input.logo !== undefined) orgPatch.logo = input.logo
  if (input.cover !== undefined) orgPatch.cover = input.cover
  if (Object.keys(orgPatch).length > 0) {
    await updateOrganization(homeView.organizationId, orgPatch)
  }
  revalidatePath(`/home/${handle}`)
  revalidatePath(`/home/${handle}/admin/settings`)
  return { ok: true }
}

/** Change the Home's subscription plan. */
export async function changePlan(handle: string, plan: HomePlanId) {
  const { home: homeView } = await requireHomeManager(handle, "subscription.manage")
  if (!isHomePlanId(plan)) throw new Error("Unknown plan.")
  await db.update(home).set({ plan, updatedAt: new Date() }).where(eq(home.id, homeView.id))
  revalidatePath(`/home/${handle}/admin/subscription`)
  return { plan }
}

/** Aggregated data for the admin Overview page. */
export async function getHomeAdminOverview(handle: string): Promise<{
  home: HomeView
  memberCount: number
  pendingCount: number
  adminCount: number
}> {
  const { home: homeView } = await requireHomeManager(handle, "members.view")
  const all = await db.select().from(homeMembership).where(eq(homeMembership.homeId, homeView.id))
  const memberCount = all.filter((m) => m.status === "active").length
  const pendingCount = all.filter((m) => m.status === "pending").length
  const adminCount = all.filter((m) => m.status === "active" && m.role !== "member").length
  return { home: homeView, memberCount, pendingCount, adminCount }
}
