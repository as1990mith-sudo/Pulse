import { and, count, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { follow, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"

export type Profile = {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  followers: number
  following: number
  isSelf: boolean
  isFollowing: boolean
}

/** Loads a user's public profile by id, or null if the user does not exist. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
  if (!row) return null

  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null

  const [[followersRow], [followingRow]] = await Promise.all([
    db.select({ value: count() }).from(follow).where(eq(follow.followingId, userId)),
    db.select({ value: count() }).from(follow).where(eq(follow.followerId, userId)),
  ])

  let isFollowing = false
  if (viewerId && viewerId !== userId) {
    const existing = await db
      .select({ id: follow.id })
      .from(follow)
      .where(and(eq(follow.followerId, viewerId), eq(follow.followingId, userId)))
      .limit(1)
    isFollowing = existing.length > 0
  }

  return {
    id: row.id,
    name: row.name,
    handle: getHandle(row.name),
    initials: getInitials(row.name),
    color: getAvatarColor(row.id),
    followers: followersRow?.value ?? 0,
    following: followingRow?.value ?? 0,
    isSelf: viewerId === userId,
    isFollowing,
  }
}
