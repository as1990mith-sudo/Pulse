import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"

export type CurrentUser = {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  image: string | null
}

/** Returns the signed-in user (with derived handle + initials), or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Treat any failure (no session, or the auth/session lookup erroring because
  // the database is unreachable) as "logged out" rather than throwing, so a
  // transient DB outage doesn't crash every page that reads the current user.
  let session
  try {
    session = await auth.api.getSession({ headers: await headers() })
  } catch (err) {
    console.error("[v0] getCurrentUser session lookup failed:", err)
    return null
  }
  if (!session?.user) return null
  return {
    id: session.user.id,
    name: session.user.name,
    handle: getHandle(session.user.name),
    initials: getInitials(session.user.name),
    color: getAvatarColor(session.user.id),
    image: session.user.image ?? null,
  }
}
