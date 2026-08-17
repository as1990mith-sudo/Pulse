import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { home, homeAuthKey, homeMembership } from "@/lib/db/schema"
import { generateAuthKey } from "@/lib/home/auth-key"
import { isHomePlanId, type HomePlanId } from "@/lib/home/plans"
import type { HomeJoinPolicy } from "@/lib/home/types"

/**
 * Inserts a fresh active authorisation key for a Home, retrying on the rare
 * unique-constraint collision. Shared by provisioning and key regeneration so
 * there is exactly one implementation of key issuance.
 */
export async function insertFreshKey(homeId: string, orgName: string, createdBy: string): Promise<string> {
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

export type EnsureHomeInput = {
  org: { id: string; name: string; ownerId: string }
  plan?: HomePlanId
  accentColor?: string | null
  joinPolicy?: HomeJoinPolicy
}

/**
 * Guarantees that an organisation has a fully-provisioned Frequency Home:
 *   1. a `home` row (organisationId is unique per Home),
 *   2. an active Owner `homeMembership` for the org owner,
 *   3. an active Organisation Authorisation Key.
 *
 * Every organisation on Frequency is a Home, so this runs as part of org
 * creation and can also be replayed to backfill or repair existing orgs.
 * Fully idempotent — each step is skipped if it already exists, so calling it
 * repeatedly never duplicates rows or resets an existing key.
 *
 * Passing `plan`/`accentColor`/`joinPolicy` (e.g. from the onboarding flow)
 * syncs those fields onto an existing Home; omitting them leaves them untouched
 * and applies sensible defaults when first creating the Home.
 */
export async function ensureHomeForOrg(input: EnsureHomeInput): Promise<{ homeId: string; created: boolean }> {
  const { org } = input
  const plan: HomePlanId = input.plan && isHomePlanId(input.plan) ? input.plan : "premium"

  // 1) Home row (idempotent on organizationId).
  const existing = await db.select().from(home).where(eq(home.organizationId, org.id)).limit(1)
  let homeId: string
  let created = false
  if (existing.length > 0) {
    homeId = existing[0].id
    // Sync only the fields explicitly supplied by the caller.
    const patch: Partial<typeof home.$inferInsert> = {}
    if (input.plan && isHomePlanId(input.plan)) patch.plan = plan
    if (input.accentColor !== undefined) patch.accentColor = input.accentColor ?? existing[0].accentColor
    if (input.joinPolicy !== undefined) patch.joinPolicy = input.joinPolicy
    if (Object.keys(patch).length > 0) {
      await db
        .update(home)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(home.id, homeId))
    }
  } else {
    homeId = crypto.randomUUID()
    await db.insert(home).values({
      id: homeId,
      organizationId: org.id,
      name: `${org.name} Home`,
      plan,
      accentColor: input.accentColor ?? null,
      joinPolicy: input.joinPolicy ?? "auto",
    })
    created = true
  }

  // 2) Owner membership for the org owner (idempotent — one per user per Home).
  const ownerRow = await db
    .select({ id: homeMembership.id })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.userId, org.ownerId)))
    .limit(1)
  if (ownerRow.length === 0) {
    await db.insert(homeMembership).values({
      id: crypto.randomUUID(),
      homeId,
      userId: org.ownerId,
      role: "owner",
      status: "active",
      joinedVia: "created",
    })
  }

  // 3) Active authorisation key — only issue one if none is currently active.
  const keys = await db
    .select({ active: homeAuthKey.active })
    .from(homeAuthKey)
    .where(eq(homeAuthKey.homeId, homeId))
  if (!keys.some((k) => k.active)) {
    await insertFreshKey(homeId, org.name, org.ownerId)
  }

  return { homeId, created }
}
