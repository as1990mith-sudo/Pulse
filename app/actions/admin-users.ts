"use server"

import { and, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { adminMember, moderationAction, notification, session, userModerationState } from "@/lib/db/schema"
import { requirePermission } from "@/lib/admin-auth"
import { writeAudit } from "@/lib/audit"
import { ADMIN_ROLES, type AdminRole } from "@/lib/rbac"

/** Ensures a moderation-state row exists for a user, then returns it updated. */
async function upsertModState(userId: string, patch: Record<string, unknown>, updatedBy: string) {
  await db
    .insert(userModerationState)
    .values({ userId, ...patch, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userModerationState.userId,
      set: { ...patch, updatedBy, updatedAt: new Date() },
    })
}

async function recordAction(
  targetId: string,
  action: string,
  reason: string | null,
  adminId: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(moderationAction).values({
    id: randomUUID(),
    targetType: "user",
    targetId,
    action,
    reason,
    adminId,
    metadata: metadata ?? null,
    createdAt: new Date(),
  })
}

async function notify(userId: string, title: string, body: string) {
  try {
    await db.insert(notification).values({
      userId,
      actorId: "system",
      actorName: "Frequency",
      type: "moderation",
      message: `${title}: ${body}`,
      link: "/settings",
      read: false,
      createdAt: new Date(),
    })
  } catch {
    // a notification failure should never block the moderation action itself
  }
}

/** Suspend a user until a given date (or indefinitely). */
export async function suspendUser(userId: string, reason: string, until: string | null) {
  const actor = await requirePermission("users.moderate")
  const suspendedUntil = until ? new Date(until) : null
  await upsertModState(userId, { status: "suspended", suspendedUntil, reason }, actor.userId)
  await recordAction(userId, "suspend", reason, actor.userId, { until })
  await writeAudit(actor.userId, "user.suspend", { targetType: "user", targetId: userId, metadata: { reason, until } })
  await notify(userId, "Account suspended", reason || "Your account has been suspended by a moderator.")
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
  return { ok: true }
}

export async function unsuspendUser(userId: string) {
  const actor = await requirePermission("users.moderate")
  await upsertModState(userId, { status: "active", suspendedUntil: null, reason: null }, actor.userId)
  await recordAction(userId, "unsuspend", null, actor.userId)
  await writeAudit(actor.userId, "user.unsuspend", { targetType: "user", targetId: userId })
  await notify(userId, "Suspension lifted", "Your account is active again.")
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
  return { ok: true }
}

export async function banUser(userId: string, reason: string) {
  const actor = await requirePermission("users.moderate")
  await upsertModState(userId, { status: "banned", reason }, actor.userId)
  await recordAction(userId, "ban", reason, actor.userId)
  await writeAudit(actor.userId, "user.ban", { targetType: "user", targetId: userId, metadata: { reason } })
  // Revoke active sessions so the ban takes effect immediately.
  await db.delete(session).where(eq(session.userId, userId))
  await notify(userId, "Account banned", reason || "Your account has been banned.")
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
  return { ok: true }
}

export async function unbanUser(userId: string) {
  const actor = await requirePermission("users.moderate")
  await upsertModState(userId, { status: "active", reason: null }, actor.userId)
  await recordAction(userId, "unban", null, actor.userId)
  await writeAudit(actor.userId, "user.unban", { targetType: "user", targetId: userId })
  await notify(userId, "Ban lifted", "Your account has been reinstated.")
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
  return { ok: true }
}

export async function setVerified(userId: string, verified: boolean) {
  const actor = await requirePermission("users.moderate")
  await upsertModState(userId, { verified }, actor.userId)
  await recordAction(userId, verified ? "verify" : "unverify", null, actor.userId)
  await writeAudit(actor.userId, verified ? "user.verify" : "user.unverify", {
    targetType: "user",
    targetId: userId,
  })
  if (verified) await notify(userId, "You're verified", "Your account has been verified on Frequency.")
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
  return { ok: true }
}

export async function warnUser(userId: string, reason: string) {
  const actor = await requirePermission("users.moderate")
  await upsertModState(
    userId,
    { warnings: sql`coalesce(${userModerationState.warnings}, 0) + 1`, status: "warned" },
    actor.userId,
  )
  await recordAction(userId, "warn", reason, actor.userId)
  await writeAudit(actor.userId, "user.warn", { targetType: "user", targetId: userId, metadata: { reason } })
  await notify(userId, "Warning issued", reason || "A moderator has issued a warning on your account.")
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
  return { ok: true }
}

export async function resetWarnings(userId: string) {
  const actor = await requirePermission("users.moderate")
  await upsertModState(userId, { warnings: 0, status: "active" }, actor.userId)
  await recordAction(userId, "reset_warnings", null, actor.userId)
  await writeAudit(actor.userId, "user.reset_warnings", { targetType: "user", targetId: userId })
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
  return { ok: true }
}

/** Promote/demote a user to an admin role. Only Super Admin (roles.manage). */
export async function setAdminRole(userId: string, role: AdminRole | null) {
  const actor = await requirePermission("roles.manage")
  if (role && !ADMIN_ROLES.some((r) => r.id === role)) {
    return { ok: false, error: "Invalid role" }
  }
  if (role) {
    await db
      .insert(adminMember)
      .values({ id: randomUUID(), userId, role, createdBy: actor.userId, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({ target: adminMember.userId, set: { role, updatedAt: new Date() } })
  } else {
    await db.delete(adminMember).where(eq(adminMember.userId, userId))
  }
  await recordAction(userId, role ? `promote:${role}` : "revoke_admin", null, actor.userId)
  await writeAudit(actor.userId, role ? "role.assign" : "role.revoke", {
    targetType: "user",
    targetId: userId,
    metadata: { role },
  })
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
  revalidatePath("/admin/users/roles")
  return { ok: true }
}
