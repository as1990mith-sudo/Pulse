"use server"

import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { follow } from "@/lib/db/schema"
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
