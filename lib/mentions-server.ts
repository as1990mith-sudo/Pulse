import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { follow, user as userTable } from "@/lib/db/schema"
import type { MentionRef } from "@/lib/mentions"

export type MentionPrivacy = "everyone" | "followers" | "none"

export const MENTION_PRIVACY_VALUES: MentionPrivacy[] = ["everyone", "followers", "none"]

/**
 * Given the acting (tagging) user and a list of candidate mention refs parsed
 * from token text, return only the mentions that are ALLOWED by each target's
 * `mentionPrivacy` setting:
 *   - "everyone"  → always allowed
 *   - "followers" → allowed only if the target follows the actor
 *   - "none"      → never allowed
 * Self-mentions are always allowed. Unknown/deleted users are dropped.
 *
 * Blocked mentions are simply omitted from the result; the caller downgrades
 * their tokens to plain text and sends them no notification.
 */
export async function filterAllowedMentions(actorId: string, refs: MentionRef[]): Promise<MentionRef[]> {
  if (refs.length === 0) return []

  const ids = [...new Set(refs.map((r) => r.userId))]
  const rows = await db
    .select({ id: userTable.id, privacy: userTable.mentionPrivacy })
    .from(userTable)
    .where(inArray(userTable.id, ids))
  const privacy = new Map(rows.map((r) => [r.id, (r.privacy as MentionPrivacy) ?? "everyone"]))

  // For targets set to "followers", we only allow the mention when the target
  // follows the actor (followerId = target, followingId = actor).
  const followersOnly = ids.filter((id) => privacy.get(id) === "followers" && id !== actorId)
  let targetFollowsActor = new Set<string>()
  if (followersOnly.length > 0) {
    const frows = await db
      .select({ target: follow.followerId })
      .from(follow)
      .where(and(inArray(follow.followerId, followersOnly), eq(follow.followingId, actorId)))
    targetFollowsActor = new Set(frows.map((r) => r.target))
  }

  return refs.filter((r) => {
    const p = privacy.get(r.userId)
    if (p === undefined) return false // user no longer exists
    if (r.userId === actorId) return true // always allowed to tag yourself
    if (p === "none") return false
    if (p === "followers") return targetFollowsActor.has(r.userId)
    return true // "everyone"
  })
}
