import { headers } from "next/headers"
import { eq, inArray, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { adminMember, user as userTable } from "@/lib/db/schema"
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

/**
 * The set of every userId that is platform admin/staff: anyone with an
 * admin_member RBAC row, plus any account whose email is a bootstrap
 * ADMIN_EMAILS address (matched case-insensitively). Used to gate staff-only
 * surfaces — e.g. which authors appear on the global Articles page, and whose
 * profile shows the Catalogue tab. Failures degrade to whatever was resolved so
 * a DB hiccup can't accidentally grant staff to everyone.
 */
export async function getStaffUserIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  try {
    const rows = await db.select({ userId: adminMember.userId }).from(adminMember)
    for (const r of rows) ids.add(r.userId)
  } catch (err) {
    console.error("[v0] getStaffUserIds: admin_member lookup failed:", err)
  }
  const emails = [...bootstrapEmails()]
  if (emails.length > 0) {
    try {
      const urows = await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(inArray(sql`lower(${userTable.email})`, emails))
      for (const r of urows) ids.add(r.id)
    } catch (err) {
      console.error("[v0] getStaffUserIds: bootstrap-email lookup failed:", err)
    }
  }
  return ids
}

/** Whether a specific userId is platform admin/staff. */
export async function isStaffUser(userId: string): Promise<boolean> {
  const ids = await getStaffUserIds()
  return ids.has(userId)
}
