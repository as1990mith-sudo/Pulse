import { headers } from "next/headers"
import { auth } from "@/lib/auth"

/** Parsed, lowercased set of admin emails from the ADMIN_EMAILS env var. */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export type AdminUser = {
  id: string
  name: string
  email: string
}

/**
 * Returns the signed-in user if their email is in ADMIN_EMAILS, otherwise null.
 * Used by the /admin page and every admin server action.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) return null
  if (!adminEmails().has(session.user.email.toLowerCase())) return null
  return { id: session.user.id, name: session.user.name, email: session.user.email }
}

/** Throws if the current user is not an admin. For use inside server actions. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser()
  if (!admin) throw new Error("Not authorized")
  return admin
}
