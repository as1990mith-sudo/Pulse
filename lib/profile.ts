import { and, count, eq, ilike } from "drizzle-orm"
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
  image: string | null
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
    image: row.image,
    followers: followersRow?.value ?? 0,
    following: followingRow?.value ?? 0,
    isSelf: viewerId === userId,
    isFollowing,
  }
}

export type ProfileSummary = {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  image: string | null
}

function toSummary(row: { id: string; name: string; image: string | null }): ProfileSummary {
  return {
    id: row.id,
    name: row.name,
    handle: getHandle(row.name),
    initials: getInitials(row.name),
    color: getAvatarColor(row.id),
    image: row.image,
  }
}

/** Searches users by name for the header search box. Returns up to 8 matches. */
export async function searchUsers(query: string): Promise<ProfileSummary[]> {
  const q = query.trim()
  if (q.length < 1) return []
  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(userTable)
    .where(ilike(userTable.name, `%${q}%`))
    .orderBy(userTable.name)
    .limit(8)
  return rows.map(toSummary)
}

/** Users who follow the given user. */
export async function getFollowers(userId: string): Promise<ProfileSummary[]> {
  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(follow)
    .innerJoin(userTable, eq(follow.followerId, userTable.id))
    .where(eq(follow.followingId, userId))
    .orderBy(userTable.name)
  return rows.map(toSummary)
}

/** Users the given user is following. */
export async function getFollowing(userId: string): Promise<ProfileSummary[]> {
  const rows = await db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(follow)
    .innerJoin(userTable, eq(follow.followingId, userTable.id))
    .where(eq(follow.followerId, userId))
    .orderBy(userTable.name)
  return rows.map(toSummary)
}
