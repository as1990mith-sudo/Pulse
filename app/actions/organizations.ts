"use server"

import { and, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { feedPost, organization, subscription, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { formatPostTimestamp } from "@/lib/format-timestamp"
import {
  type OrganizationView,
  type OrgCategory,
  type OrgReach,
  type OrgSocials,
  orgCategoryLabel,
  orgLocationLabel,
  orgReachLabel,
  slugifyHandle,
} from "@/lib/org-types"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

async function getViewerId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

type OrgRow = typeof organization.$inferSelect

/**
 * Resolves an org row into a client view for a given viewer: subscriber count,
 * whether the viewer subscribes (and their notify preference), and ownership.
 */
async function buildOrganizationView(org: OrgRow, viewerId: string | null): Promise<OrganizationView> {
  const [subCountRows, mySub] = await Promise.all([
    db.select({ value: count() }).from(subscription).where(eq(subscription.organizationId, org.id)),
    viewerId
      ? db
          .select()
          .from(subscription)
          .where(and(eq(subscription.userId, viewerId), eq(subscription.organizationId, org.id)))
          .limit(1)
      : Promise.resolve([] as (typeof subscription.$inferSelect)[]),
  ])

  return {
    id: org.id,
    ownerId: org.ownerId,
    name: org.name,
    handle: org.handle,
    category: org.category as OrgCategory,
    categoryOther: org.categoryOther,
    categoryLabel: orgCategoryLabel(org.category, org.categoryOther),
    description: org.description,
    logo: org.logo,
    cover: org.cover,
    initials: getInitials(org.name),
    color: getAvatarColor(org.id),
    reach: org.reach as OrgReach,
    reachLabel: orgReachLabel(org.reach),
    onlineOnly: org.onlineOnly,
    country: org.country,
    city: org.city,
    region: org.region,
    locationLabel: orgLocationLabel(org.onlineOnly, org.city, org.region, org.country),
    website: org.website,
    socials: (org.socials as OrgSocials | null) ?? null,
    mission: org.mission,
    vision: org.vision,
    history: org.history,
    beliefs: org.beliefs,
    contactEmail: org.contactEmail,
    contactPhone: org.contactPhone,
    verified: org.verified,
    verificationStatus: org.verificationStatus as OrganizationView["verificationStatus"],
    subscriberCount: Number(subCountRows[0]?.value ?? 0),
    isOwner: viewerId === org.ownerId,
    isSubscribed: mySub.length > 0,
    notify: mySub[0]?.notify ?? false,
  }
}

/** Generates a unique org handle from a name, appending -2, -3, ... on collision. */
async function uniqueHandle(name: string): Promise<string> {
  const base = slugifyHandle(name) || "ministry"
  let candidate = base
  let n = 1
  // Loop until we find a free handle. Bounded in practice by collisions.
  while (true) {
    const existing = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.handle, candidate))
      .limit(1)
    if (existing.length === 0) return candidate
    n += 1
    candidate = `${base}-${n}`
  }
}

export type CreateOrganizationInput = {
  name: string
  category: OrgCategory
  categoryOther?: string
  description?: string
  logo?: string
  reach: OrgReach
  onlineOnly?: boolean
  country?: string
  city?: string
  region?: string
  website?: string
}

/**
 * Creates an organisation for the current user and flips their account to an
 * organisation account. Called right after signup on the org path. One org per
 * owner in Phase 1 — returns the existing org if they already have one.
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<{ handle: string }> {
  const user = await requireUser()

  const existing = await db
    .select()
    .from(organization)
    .where(eq(organization.ownerId, user.id))
    .limit(1)
  if (existing.length > 0) return { handle: existing[0].handle }

  const name = input.name.trim()
  if (!name) throw new Error("Organisation name is required.")
  if (input.category === "other" && !input.categoryOther?.trim()) {
    throw new Error("Please specify your organisation category.")
  }

  const handle = await uniqueHandle(name)
  const id = crypto.randomUUID()
  const website = normalizeUrl(input.website)

  await db.insert(organization).values({
    id,
    ownerId: user.id,
    name,
    handle,
    category: input.category,
    categoryOther: input.category === "other" ? input.categoryOther?.trim() || null : null,
    description: input.description?.trim() || null,
    logo: input.logo || user.image || null,
    reach: input.reach,
    onlineOnly: !!input.onlineOnly,
    country: input.onlineOnly ? null : input.country?.trim() || null,
    city: input.onlineOnly ? null : input.city?.trim() || null,
    region: input.onlineOnly ? null : input.region?.trim() || null,
    website,
  })

  await db.update(userTable).set({ accountType: "organization" }).where(eq(userTable.id, user.id))

  revalidatePath("/feed")
  return { handle }
}

/** Normalises a user-entered website into an absolute https URL, or null. */
function normalizeUrl(raw?: string | null): string | null {
  const v = raw?.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}

/** The current user's organisation, or null if they don't own one. */
export async function getMyOrganization(): Promise<OrganizationView | null> {
  const viewerId = await getViewerId()
  if (!viewerId) return null
  const rows = await db.select().from(organization).where(eq(organization.ownerId, viewerId)).limit(1)
  if (rows.length === 0) return null
  return buildOrganizationView(rows[0], viewerId)
}

/** Look up an organisation by its handle for the public profile page. */
export async function getOrganizationByHandle(handle: string): Promise<OrganizationView | null> {
  const viewerId = await getViewerId()
  const rows = await db.select().from(organization).where(eq(organization.handle, handle)).limit(1)
  if (rows.length === 0) return null
  return buildOrganizationView(rows[0], viewerId)
}

export type UpdateOrganizationInput = Partial<{
  name: string
  category: OrgCategory
  categoryOther: string | null
  description: string | null
  logo: string | null
  cover: string | null
  reach: OrgReach
  onlineOnly: boolean
  country: string | null
  city: string | null
  region: string | null
  website: string | null
  socials: OrgSocials | null
  mission: string | null
  vision: string | null
  history: string | null
  beliefs: string | null
  contactEmail: string | null
  contactPhone: string | null
}>

/** Owner-only update of an organisation's profile / About fields. */
export async function updateOrganization(orgId: string, input: UpdateOrganizationInput) {
  const user = await requireUser()
  const rows = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  const org = rows[0]
  if (!org) throw new Error("Organisation not found.")
  if (org.ownerId !== user.id) throw new Error("You can only edit your own organisation.")

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  const assign = <K extends keyof UpdateOrganizationInput>(key: K) => {
    if (input[key] !== undefined) patch[key as string] = input[key]
  }
  ;(
    [
      "name",
      "category",
      "categoryOther",
      "description",
      "logo",
      "cover",
      "reach",
      "onlineOnly",
      "country",
      "city",
      "region",
      "socials",
      "mission",
      "vision",
      "history",
      "beliefs",
      "contactEmail",
      "contactPhone",
    ] as (keyof UpdateOrganizationInput)[]
  ).forEach(assign)
  if (input.website !== undefined) patch.website = normalizeUrl(input.website)

  await db.update(organization).set(patch).where(eq(organization.id, orgId))
  revalidatePath(`/org/${org.handle}`)
  return { ok: true }
}

/** Subscribe / unsubscribe the current user to an organisation. */
export async function toggleSubscribe(input: { organizationId: string; subscribe: boolean }) {
  const user = await requireUser()
  if (input.subscribe) {
    await db
      .insert(subscription)
      .values({ userId: user.id, organizationId: input.organizationId, notify: true })
      .onConflictDoNothing()
  } else {
    await db
      .delete(subscription)
      .where(and(eq(subscription.userId, user.id), eq(subscription.organizationId, input.organizationId)))
  }
  revalidatePath("/feed")
  return { subscribed: input.subscribe }
}

/** Toggle per-organisation notifications for the current user's subscription. */
export async function setSubscriptionNotify(input: { organizationId: string; notify: boolean }) {
  const user = await requireUser()
  await db
    .update(subscription)
    .set({ notify: input.notify })
    .where(and(eq(subscription.userId, user.id), eq(subscription.organizationId, input.organizationId)))
  return { notify: input.notify }
}

/** Owner requests official verification — moves status to "pending" for admin review. */
export async function requestVerification(orgId: string) {
  const user = await requireUser()
  const rows = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  const org = rows[0]
  if (!org) throw new Error("Organisation not found.")
  if (org.ownerId !== user.id) throw new Error("Only the organisation owner can request verification.")
  if (org.verified) return { status: "approved" as const }

  await db
    .update(organization)
    .set({ verificationStatus: "pending", updatedAt: new Date() })
    .where(eq(organization.id, orgId))
  revalidatePath(`/org/${org.handle}`)
  return { status: "pending" as const }
}

/** The set of organisation ids the current user subscribes to (empty if signed out). */
export async function getSubscribedOrgIds(): Promise<string[]> {
  const viewerId = await getViewerId()
  if (!viewerId) return []
  const rows = await db
    .select({ organizationId: subscription.organizationId })
    .from(subscription)
    .where(eq(subscription.userId, viewerId))
  return rows.map((r) => r.organizationId)
}

/**
 * Lightweight organisation directory used by the subscribe / discovery UI in
 * Phase 1. With a query, matches name/description/category; otherwise lists
 * organisations most-subscribed first. Full ranked discovery lands in a later
 * phase.
 */
export async function listOrganizations(query?: string): Promise<OrganizationView[]> {
  const viewerId = await getViewerId()
  const q = (query ?? "").trim()

  const rows = q
    ? await db
        .select()
        .from(organization)
        .where(
          or(
            ilike(organization.name, `%${q}%`),
            ilike(organization.description, `%${q}%`),
            ilike(organization.category, `%${q}%`),
          ),
        )
        .orderBy(desc(organization.createdAt))
        .limit(50)
    : await db.select().from(organization).orderBy(desc(organization.createdAt)).limit(50)

  if (rows.length === 0) return []

  // Subscriber counts + the viewer's own subscriptions in two batched queries.
  const ids = rows.map((r) => r.id)
  const [countRows, mySubs] = await Promise.all([
    db
      .select({ id: subscription.organizationId, value: count() })
      .from(subscription)
      .where(inArray(subscription.organizationId, ids))
      .groupBy(subscription.organizationId),
    viewerId
      ? db
          .select()
          .from(subscription)
          .where(and(eq(subscription.userId, viewerId), inArray(subscription.organizationId, ids)))
      : Promise.resolve([] as (typeof subscription.$inferSelect)[]),
  ])
  const countMap = new Map(countRows.map((r) => [r.id, Number(r.value)]))
  const subMap = new Map(mySubs.map((s) => [s.organizationId, s]))

  const views = rows.map((org) => ({
    id: org.id,
    ownerId: org.ownerId,
    name: org.name,
    handle: org.handle,
    category: org.category as OrgCategory,
    categoryOther: org.categoryOther,
    categoryLabel: orgCategoryLabel(org.category, org.categoryOther),
    description: org.description,
    logo: org.logo,
    cover: org.cover,
    initials: getInitials(org.name),
    color: getAvatarColor(org.id),
    reach: org.reach as OrgReach,
    reachLabel: orgReachLabel(org.reach),
    onlineOnly: org.onlineOnly,
    country: org.country,
    city: org.city,
    region: org.region,
    locationLabel: orgLocationLabel(org.onlineOnly, org.city, org.region, org.country),
    website: org.website,
    socials: (org.socials as OrgSocials | null) ?? null,
    mission: org.mission,
    vision: org.vision,
    history: org.history,
    beliefs: org.beliefs,
    contactEmail: org.contactEmail,
    contactPhone: org.contactPhone,
    verified: org.verified,
    verificationStatus: org.verificationStatus as OrganizationView["verificationStatus"],
    subscriberCount: countMap.get(org.id) ?? 0,
    isOwner: viewerId === org.ownerId,
    isSubscribed: subMap.has(org.id),
    notify: subMap.get(org.id)?.notify ?? false,
  }))

  // Browsing (no query): most-subscribed first so discovery never feels empty.
  if (!q) views.sort((a, b) => b.subscriberCount - a.subscriberCount || a.name.localeCompare(b.name))
  return views
}

export type DiscoverBucket = "subscribed" | "nearby" | "featured" | "new"

export type DiscoverOrganizationView = OrganizationView & { bucket: DiscoverBucket }

export type DiscoverParams = {
  query?: string
  category?: OrgCategory | "all"
  reach?: OrgReach | "all"
  // "nearby" limits results to organisations that match the viewer's location.
  scope?: "all" | "nearby"
}

/** The viewer's saved location (or null everywhere when signed out / unset). */
export async function getMyLocation(): Promise<{ country: string | null; city: string | null; region: string | null }> {
  const viewerId = await getViewerId()
  if (!viewerId) return { country: null, city: null, region: null }
  const rows = await db
    .select({ country: userTable.country, city: userTable.city, region: userTable.region })
    .from(userTable)
    .where(eq(userTable.id, viewerId))
    .limit(1)
  const r = rows[0]
  return { country: r?.country ?? null, city: r?.city ?? null, region: r?.region ?? null }
}

/** Whether two location strings refer to the same place (loose, case-insensitive). */
function sameePlace(a?: string | null, b?: string | null): boolean {
  const x = a?.trim().toLowerCase()
  const y = b?.trim().toLowerCase()
  return !!x && !!y && x === y
}

/**
 * Ranked organisation discovery. For a signed-in viewer, results are ordered
 * subscribed → nearby (matching their city/country) → featured (verified) →
 * new, and each row is tagged with the bucket it fell into so the UI can group
 * them. Optional search + category/reach/scope filters narrow the set first.
 */
export async function discoverOrganizations(params: DiscoverParams = {}): Promise<DiscoverOrganizationView[]> {
  const viewerId = await getViewerId()
  const q = (params.query ?? "").trim()
  const category = params.category && params.category !== "all" ? params.category : null
  const reach = params.reach && params.reach !== "all" ? params.reach : null
  const scope = params.scope ?? "all"

  const conditions: SQL[] = []
  if (q) {
    const search = or(
      ilike(organization.name, `%${q}%`),
      ilike(organization.description, `%${q}%`),
      ilike(organization.category, `%${q}%`),
      ilike(organization.city, `%${q}%`),
      ilike(organization.country, `%${q}%`),
    )
    if (search) conditions.push(search)
  }
  if (category) conditions.push(eq(organization.category, category))
  if (reach) conditions.push(eq(organization.reach, reach))

  const base = db.select().from(organization)
  const rows = await (conditions.length ? base.where(and(...conditions)) : base)
    .orderBy(desc(organization.createdAt))
    .limit(100)

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const [countRows, mySubs, myLoc] = await Promise.all([
    db
      .select({ id: subscription.organizationId, value: count() })
      .from(subscription)
      .where(inArray(subscription.organizationId, ids))
      .groupBy(subscription.organizationId),
    viewerId
      ? db
          .select()
          .from(subscription)
          .where(and(eq(subscription.userId, viewerId), inArray(subscription.organizationId, ids)))
      : Promise.resolve([] as (typeof subscription.$inferSelect)[]),
    getMyLocation(),
  ])
  const countMap = new Map(countRows.map((r) => [r.id, Number(r.value)]))
  const subMap = new Map(mySubs.map((s) => [s.organizationId, s]))

  const hasLoc = !!(myLoc.city || myLoc.country)
  const isNearby = (org: OrgRow) =>
    hasLoc && !org.onlineOnly && (sameePlace(org.city, myLoc.city) || sameePlace(org.country, myLoc.country))

  let views: DiscoverOrganizationView[] = rows.map((org) => {
    const subscribed = subMap.has(org.id)
    const nearby = isNearby(org)
    const bucket: DiscoverBucket = subscribed ? "subscribed" : nearby ? "nearby" : org.verified ? "featured" : "new"
    return {
      id: org.id,
      ownerId: org.ownerId,
      name: org.name,
      handle: org.handle,
      category: org.category as OrgCategory,
      categoryOther: org.categoryOther,
      categoryLabel: orgCategoryLabel(org.category, org.categoryOther),
      description: org.description,
      logo: org.logo,
      cover: org.cover,
      initials: getInitials(org.name),
      color: getAvatarColor(org.id),
      reach: org.reach as OrgReach,
      reachLabel: orgReachLabel(org.reach),
      onlineOnly: org.onlineOnly,
      country: org.country,
      city: org.city,
      region: org.region,
      locationLabel: orgLocationLabel(org.onlineOnly, org.city, org.region, org.country),
      website: org.website,
      socials: (org.socials as OrgSocials | null) ?? null,
      mission: org.mission,
      vision: org.vision,
      history: org.history,
      beliefs: org.beliefs,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      verified: org.verified,
      verificationStatus: org.verificationStatus as OrganizationView["verificationStatus"],
      subscriberCount: countMap.get(org.id) ?? 0,
      isOwner: viewerId === org.ownerId,
      isSubscribed: subscribed,
      notify: subMap.get(org.id)?.notify ?? false,
      bucket,
    }
  })

  // "Nearby" scope: only keep subscribed + nearby organisations.
  if (scope === "nearby") views = views.filter((v) => v.bucket === "subscribed" || v.bucket === "nearby")

  const order: Record<DiscoverBucket, number> = { subscribed: 0, nearby: 1, featured: 2, new: 3 }
  views.sort((a, b) => {
    if (order[a.bucket] !== order[b.bucket]) return order[a.bucket] - order[b.bucket]
    // Within a tier: most-subscribed first, then alphabetical.
    return b.subscriberCount - a.subscriberCount || a.name.localeCompare(b.name)
  })
  return views
}

/** Save the current user's optional location (used by discovery + onboarding). */
export async function updateMyLocation(input: { country?: string | null; city?: string | null; region?: string | null }) {
  const user = await requireUser()
  await db
    .update(userTable)
    .set({
      country: input.country?.trim() || null,
      city: input.city?.trim() || null,
      region: input.region?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, user.id))
  revalidatePath("/discover")
  return { ok: true }
}

/** Marks the post-signup onboarding as complete (or skipped) for the user. */
export async function completeOnboarding() {
  const user = await requireUser()
  await db.update(userTable).set({ onboardedAt: new Date() }).where(eq(userTable.id, user.id))
  return { ok: true }
}

/** Whether the current user still needs the onboarding subscribe step. */
export async function needsOnboarding(): Promise<boolean> {
  const viewerId = await getViewerId()
  if (!viewerId) return false
  const rows = await db
    .select({ onboardedAt: userTable.onboardedAt, accountType: userTable.accountType })
    .from(userTable)
    .where(eq(userTable.id, viewerId))
    .limit(1)
  const r = rows[0]
  if (!r || r.accountType === "organization") return false
  return !r.onboardedAt
}

export type OrgPostMedia = { type: "image" | "video"; url: string }

export type OrgPostView = {
  id: number
  text: string
  image: string | null
  video: string | null
  media: OrgPostMedia[]
  likes: number
  reposts: number
  edited: boolean
  postedAt: string
  createdAtMs: number
}

/** The main-feed posts published by an organisation, newest first. */
export async function getOrganizationPosts(orgId: string): Promise<OrgPostView[]> {
  const rows = await db
    .select()
    .from(feedPost)
    .where(and(eq(feedPost.organizationId, orgId), eq(feedPost.deleted, false)))
    .orderBy(desc(feedPost.createdAt))
    .limit(50)

  return rows.map((p) => {
    const media: OrgPostMedia[] =
      (p.media as OrgPostMedia[] | null)?.length
        ? (p.media as OrgPostMedia[])
        : p.image
          ? [{ type: "image", url: p.image }]
          : p.video
            ? [{ type: "video", url: p.video }]
            : []
    return {
      id: p.id,
      text: p.text,
      image: p.image,
      video: p.video,
      media,
      likes: p.likes,
      reposts: p.reposts,
      edited: !!p.editedAt,
      postedAt: formatPostTimestamp(p.createdAt),
      createdAtMs: p.createdAt.getTime(),
    }
  })
}

export type OrgSubscriberView = {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  image: string | null
}

/** The individuals subscribed to an organisation (for the Subscribers tab). */
export async function getOrganizationSubscribers(orgId: string): Promise<OrgSubscriberView[]> {
  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(subscription)
    .innerJoin(userTable, eq(subscription.userId, userTable.id))
    .where(eq(subscription.organizationId, orgId))
    .orderBy(desc(subscription.createdAt))
    .limit(100)

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    handle: getHandle(r.name),
    initials: getInitials(r.name),
    color: getAvatarColor(r.id),
    image: r.image,
  }))
}
