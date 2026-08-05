import "server-only"

import { and, count, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { like } from "@/lib/db/schema"

/**
 * The kinds of content a user can like. Keep these keys in sync with the
 * `targetType` values passed from each server action.
 */
export type LikeTarget =
  | "post"
  | "feed_comment"
  | "episode"
  | "episode_comment"
  | "devotional"
  | "devotional_comment"
  | "community_comment"
  | "community_post"
  | "dream_reply"
  | "article"
  | "article_comment"

/**
 * Returns the subset of `targetIds` that the given user has already liked, as a
 * Set for O(1) lookups. Returns an empty set for signed-out users or empty input
 * so callers can use it unconditionally.
 */
export async function getLikedSet(
  userId: string | null,
  targetType: LikeTarget,
  targetIds: number[],
): Promise<Set<number>> {
  if (!userId || targetIds.length === 0) return new Set()
  const rows = await db
    .select({ targetId: like.targetId })
    .from(like)
    .where(
      and(
        eq(like.userId, userId),
        eq(like.targetType, targetType),
        inArray(like.targetId, targetIds),
      ),
    )
  return new Set(rows.map((r) => r.targetId))
}

/**
 * Total number of likes for a single target. Used where there is no
 * denormalized counter column (e.g. daily devotionals keyed by date).
 */
export async function getLikeCount(targetType: LikeTarget, targetId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(like)
    .where(and(eq(like.targetType, targetType), eq(like.targetId, targetId)))
  return row?.n ?? 0
}

/**
 * Idempotently sets whether `userId` likes a given target. Returns `changed:
 * true` only when a row was actually inserted (liking something not yet liked)
 * or deleted (un-liking something previously liked). Callers use this to adjust
 * the denormalized `.likes` counter by ±1 exactly once — so re-liking after a
 * refresh can never inflate the count.
 */
export async function setLike(
  userId: string,
  targetType: LikeTarget,
  targetId: number,
  liked: boolean,
): Promise<{ changed: boolean }> {
  if (liked) {
    // onConflictDoNothing makes the insert a no-op if the (user, target) like
    // already exists; `rowCount` tells us whether a row was truly added.
    const res = await db
      .insert(like)
      .values({ userId, targetType, targetId })
      .onConflictDoNothing()
    return { changed: (res.rowCount ?? 0) > 0 }
  }
  const res = await db
    .delete(like)
    .where(and(eq(like.userId, userId), eq(like.targetType, targetType), eq(like.targetId, targetId)))
  return { changed: (res.rowCount ?? 0) > 0 }
}
