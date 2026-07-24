import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { adminMember } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { type AdminRole, type Permission, roleHasPermission } from "@/lib/rbac"

export type AdminActor = {
  userId: string
  name: string
  email: string
  image: string | null
  initials: string
  color: string
  role: AdminRole
}

/** Lowercased set of bootstrap admin emails from ADMIN_EMAILS. */
function bootstrapEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Resolves the current admin actor from the session.
 *
 * Primary source of truth is the admin_member table (RBAC). As a safety net,
 * an account whose email is in ADMIN_EMAILS is always treated as super_admin
 * even if the DB row is missing — this guarantees the owner can never be locked
 * out of their own console. Returns null for non-admins.
 */
export async function getAdminActor(): Promise<AdminActor | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  const u = session?.user
  if (!u) return null

  const rows = await db.select().from(adminMember).where(eq(adminMember.userId, u.id)).limit(1)
  let role = rows[0]?.role as AdminRole | undefined

  if (!role && u.email && bootstrapEmails().has(u.email.toLowerCase())) {
    role = "super_admin"
  }
  if (!role) return null

  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    initials: getInitials(u.name),
    color: getAvatarColor(u.id),
    role,
  }
}

/** Throws if the current user is not an admin. Returns the actor otherwise. */
export async function requireAdmin(): Promise<AdminActor> {
  const actor = await getAdminActor()
  if (!actor) throw new Error("Not authorized")
  return actor
}

/** Throws unless the current admin has the given permission. */
export async function requirePermission(permission: Permission): Promise<AdminActor> {
  const actor = await requireAdmin()
  if (!roleHasPermission(actor.role, permission)) {
    throw new Error("You do not have permission to perform this action.")
  }
  return actor
}

export function actorCan(actor: AdminActor | null, permission: Permission): boolean {
  if (!actor) return false
  return roleHasPermission(actor.role, permission)
}
