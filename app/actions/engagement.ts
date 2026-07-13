"use server"

import { and, count, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { contentView, episode, episodeComment, savedItem, share } from "@/lib/db/schema"

/** Full engagement summary for an episode, shown on the player/watch screen. */
export type EpisodeEngagement = {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
}

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

/**
 * Records a single episode view. Called from the player once playback has
 * reached at least 5% of the episode's length — every qualifying play/open
 * counts (including repeats by the same person), matching the product spec.
 * Signed-out plays are recorded with a null userId.
 */
export async function recordEpisodeView(episodeId: number): Promise<void> {
  if (!episodeId || !Number.isFinite(episodeId)) return
  const userId = await currentUserId()
  await db.insert(contentView).values({ episodeId, userId })
}

/**
 * Records a deliberate share of a post or episode (send to chat, copy link,
 * native share, add to status, external app). Backs the share counts shown on
 * posts and episodes. Signed-out shares (e.g. copy link) get a null userId.
 */
export async function recordShare(input: { type: string; key: string }): Promise<void> {
  const targetType = input.type === "post" ? "post" : input.type === "episode" ? "episode" : null
  if (!targetType || !input.key) return
  const userId = await currentUserId()
  await db.insert(share).values({ targetType, targetKey: String(input.key), userId })
}

/** Total view count for a single episode. */
export async function getEpisodeViews(episodeId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(contentView)
    .where(eq(contentView.episodeId, episodeId))
  return row?.n ?? 0
}

/** Full engagement counts for one episode. */
export async function getEpisodeEngagement(episodeId: number): Promise<EpisodeEngagement> {
  const key = String(episodeId)
  const [views, likesRow, comments, shares, saves] = await Promise.all([
    db.select({ n: count() }).from(contentView).where(eq(contentView.episodeId, episodeId)),
    db.select({ likes: episode.likes }).from(episode).where(eq(episode.id, episodeId)).limit(1),
    db.select({ n: count() }).from(episodeComment).where(eq(episodeComment.episodeId, episodeId)),
    db
      .select({ n: count() })
      .from(share)
      .where(and(eq(share.targetType, "episode"), eq(share.targetKey, key))),
    db
      .select({ n: count() })
      .from(savedItem)
      .where(and(eq(savedItem.itemType, "episode"), eq(savedItem.itemKey, key))),
  ])
  return {
    views: views[0]?.n ?? 0,
    likes: likesRow[0]?.likes ?? 0,
    comments: comments[0]?.n ?? 0,
    shares: shares[0]?.n ?? 0,
    saves: saves[0]?.n ?? 0,
  }
}

/**
 * Batches view counts for a set of episode ids. Returns a map of episodeId ->
 * view count (missing ids default to 0). Used by the catalogue loaders to show
 * real "N views" on episode cards.
 */
export async function getEpisodeViewCounts(episodeIds: number[]): Promise<Map<number, number>> {
  const ids = [...new Set(episodeIds)].filter((n) => Number.isFinite(n))
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ episodeId: contentView.episodeId, n: count() })
    .from(contentView)
    .where(inArray(contentView.episodeId, ids))
    .groupBy(contentView.episodeId)
  return new Map(rows.map((r) => [r.episodeId, r.n]))
}
