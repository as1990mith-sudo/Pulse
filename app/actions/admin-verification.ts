"use server"

import { desc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { notification, organization, subscription, user as userTable } from "@/lib/db/schema"
import { requirePermission } from "@/lib/admin-auth"
import { orgCategoryLabel, orgReachLabel } from "@/lib/org-types"

export type AdminVerificationRow = {
  id: string
  name: string
  handle: string
  category: string
  reach: string
  onlineOnly: boolean
  location: string | null
  website: string | null
  description: string | null
  ownerName: string
  ownerEmail: string
  subscriberCount: number
  verified: boolean
  verificationStatus: "none" | "pending" | "approved" | "rejected"
  verificationNote: string | null
  createdAt: string
}

function locationLabel(o: { onlineOnly: boolean; city: string | null; region: string | null; country: string | null }) {
  if (o.onlineOnly) return "Online only"
  const parts = [o.city, o.region, o.country].filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

/**
 * Lists organisations for the admin verification console. Pending requests are
 * surfaced first (the review queue); everything else follows for auditing and
 * badge management.
 */
export async function listOrganizationsForReview(): Promise<AdminVerificationRow[]> {
  await requirePermission("users.moderate")

  const rows = await db
    .select({
      org: organization,
      ownerName: userTable.name,
      ownerEmail: userTable.email,
      subscriberCount: sql<number>`(
        select count(*) from ${subscription} where ${subscription.organizationId} = ${organization.id}
      )`,
    })
    .from(organization)
    .leftJoin(userTable, eq(organization.ownerId, userTable.id))
    // pending first, then newest.
    .orderBy(sql`case when ${organization.verificationStatus} = 'pending' then 0 else 1 end`, desc(organization.createdAt))

  return rows.map(({ org, ownerName, ownerEmail, subscriberCount }) => ({
    id: org.id,
    name: org.name,
    handle: org.handle,
    category: orgCategoryLabel(org.category, org.categoryOther),
    reach: orgReachLabel(org.reach),
    onlineOnly: org.onlineOnly,
    location: locationLabel(org),
    website: org.website,
    description: org.description,
    ownerName: ownerName ?? "Unknown",
    ownerEmail: ownerEmail ?? "—",
    subscriberCount: Number(subscriberCount) || 0,
    verified: org.verified,
    verificationStatus: org.verificationStatus as AdminVerificationRow["verificationStatus"],
    verificationNote: org.verificationNote,
    createdAt: org.createdAt.toISOString(),
  }))
}

/** Notifies the organisation owner about a verification decision (best-effort). */
async function notifyOwner(orgId: string, message: string, handle: string) {
  try {
    const [org] = await db.select({ ownerId: organization.ownerId }).from(organization).where(eq(organization.id, orgId)).limit(1)
    if (!org) return
    await db.insert(notification).values({
      userId: org.ownerId,
      actorId: "system",
      actorName: "Frequency",
      type: "verification",
      message,
      link: `/org/${handle}`,
      read: false,
      createdAt: new Date(),
    })
  } catch {
    // never block the decision on a notification failure
  }
}

/** Grants the verified badge and marks the request approved. */
export async function approveVerification(orgId: string) {
  await requirePermission("users.moderate")
  const [updated] = await db
    .update(organization)
    .set({ verified: true, verificationStatus: "approved", verificationNote: null, updatedAt: new Date() })
    .where(eq(organization.id, orgId))
    .returning({ handle: organization.handle, name: organization.name })

  if (updated) {
    await notifyOwner(orgId, `${updated.name} is now a verified ministry on Frequency.`, updated.handle)
    revalidatePath(`/org/${updated.handle}`)
  }
  revalidatePath("/admin/users/verification")
  return { ok: true }
}

/** Rejects a request (optionally with a note) and clears any existing badge. */
export async function rejectVerification(orgId: string, note?: string) {
  await requirePermission("users.moderate")
  const trimmed = (note ?? "").trim().slice(0, 300) || null
  const [updated] = await db
    .update(organization)
    .set({ verified: false, verificationStatus: "rejected", verificationNote: trimmed, updatedAt: new Date() })
    .where(eq(organization.id, orgId))
    .returning({ handle: organization.handle, name: organization.name })

  if (updated) {
    await notifyOwner(
      orgId,
      `Your verification request for ${updated.name} was not approved${trimmed ? `: ${trimmed}` : "."}`,
      updated.handle,
    )
    revalidatePath(`/org/${updated.handle}`)
  }
  revalidatePath("/admin/users/verification")
  return { ok: true }
}

/** Manually revokes a verified badge (e.g. on policy violation). */
export async function revokeVerification(orgId: string) {
  await requirePermission("users.moderate")
  const [updated] = await db
    .update(organization)
    .set({ verified: false, verificationStatus: "none", updatedAt: new Date() })
    .where(eq(organization.id, orgId))
    .returning({ handle: organization.handle })
  if (updated) revalidatePath(`/org/${updated.handle}`)
  revalidatePath("/admin/users/verification")
  return { ok: true }
}
