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
  const session = await auth.api.getSession({ headers: await headers() })
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
