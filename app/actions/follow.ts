"use server"

import { and, count, eq, ilike, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { follow, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { getFollowers, getFollowing, type ProfileSummary } from "@/lib/profile"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/** Follow or unfollow a user. Returns the resulting state. */
export async function toggleFollow(input: { targetUserId: string; follow: boolean }) {
  const user = await requireUser()
  if (user.id === input.targetUserId) {
    throw new Error("You can't follow yourself.")
  }

  if (input.follow) {
    await db
      .insert(follow)
      .values({ followerId: user.id, followingId: input.targetUserId })
      .onConflictDoNothing()
  } else {
    await db
      .delete(follow)
      .where(and(eq(follow.followerId, user.id), eq(follow.followingId, input.targetUserId)))
  }

  revalidatePath("/feed")
  return { following: input.follow }
}

/** Server-action wrappers so client dialogs can fetch follower/following lists. */
export async function listFollowers(userId: string): Promise<ProfileSummary[]> {
  return getFollowers(userId)
}

export async function listFollowing(userId: string): Promise<ProfileSummary[]> {
  return getFollowing(userId)
}

export type DiscoverProfile = ProfileSummary & {
  followers: number
  isFollowing: boolean
  isSelf: boolean
}

/**
 * Powers the "Find" tab. With a query, searches profiles by name; without one,
 * browses all profiles ordered by follower count. Each result carries follow
 * state for the current viewer so the list can render follow buttons inline.
 */
export async function discoverProfiles(query?: string): Promise<DiscoverProfile[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  const me = session?.user?.id ?? null
  const q = (query ?? "").trim()

  const selection = { id: userTable.id, name: userTable.name, image: userTable.image }
  const rows =
    q.length > 0
      ? await db
          .select(selection)
          .from(userTable)
          .where(ilike(userTable.name, `%${q}%`))
          .orderBy(userTable.name)
          .limit(50)
      : await db.select(selection).from(userTable).orderBy(userTable.name).limit(100)

  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  // Follower counts for every candidate, and which ones the viewer follows.
  const [followerCounts, followingRows] = await Promise.all([
    db
      .select({ id: follow.followingId, value: count() })
      .from(follow)
      .where(inArray(follow.followingId, ids))
      .groupBy(follow.followingId),
    me
      ? db
          .select({ id: follow.followingId })
          .from(follow)
          .where(and(eq(follow.followerId, me), inArray(follow.followingId, ids)))
      : Promise.resolve([] as { id: string }[]),
  ])

  const countMap = new Map(followerCounts.map((r) => [r.id, Number(r.value)]))
  const followingSet = new Set(followingRows.map((r) => r.id))

  const mapped: DiscoverProfile[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: getHandle(row.name),
    initials: getInitials(row.name),
    color: getAvatarColor(row.id),
    image: row.image,
    followers: countMap.get(row.id) ?? 0,
    isFollowing: followingSet.has(row.id),
    isSelf: row.id === me,
  }))

  // When browsing (no query), surface the most-followed accounts first.
  if (q.length === 0) {
    mapped.sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name))
  }

  return mapped
}

/** Returns the set of userIds the current user follows (empty when signed out). */
export async function getFollowingIds(): Promise<string[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return []
  const rows = await db
    .select({ followingId: follow.followingId })
    .from(follow)
    .where(eq(follow.followerId, session.user.id))
  return rows.map((r) => r.followingId)
}
