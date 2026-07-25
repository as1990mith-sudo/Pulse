"use server"

import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { article, contentReport, feedPost, user as userTable } from "@/lib/db/schema"
import { searchUsers, type ProfileSummary } from "@/lib/profile"
import { MENTION_PRIVACY_VALUES, type MentionPrivacy } from "@/lib/mentions-server"
import { downgradeBlockedHtmlMentions, downgradeBlockedMentions } from "@/lib/mentions"

/**
 * Autocomplete search for the `@` mention picker. Thin wrapper over the shared
 * user search so posts + articles (and future surfaces) all resolve mentions
 * against the same directory.
 */
export async function searchMentionCandidates(query: string): Promise<ProfileSummary[]> {
  const q = query.trim()
  if (!q) return []
  return searchUsers(q)
}

/** Returns the signed-in user's mention-privacy setting (defaults to everyone). */
export async function getMyMentionPrivacy(): Promise<MentionPrivacy> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return "everyone"
  const [row] = await db
    .select({ privacy: userTable.mentionPrivacy })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1)
  return ((row?.privacy as MentionPrivacy) ?? "everyone") satisfies MentionPrivacy
}

/** Updates who is allowed to @mention the signed-in user. */
export async function updateMentionPrivacy(
  value: MentionPrivacy,
): Promise<{ ok: true; value: MentionPrivacy } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false, error: "You must be signed in to do that." }
  if (!MENTION_PRIVACY_VALUES.includes(value)) return { ok: false, error: "Invalid setting." }

  await db.update(userTable).set({ mentionPrivacy: value }).where(eq(userTable.id, session.user.id))
  revalidatePath("/settings/privacy")
  return { ok: true, value }
}

type MentionContentType = "post" | "article"

/**
 * Lets a mentioned user remove the mention OF THEMSELVES from a post or article
 * they were tagged in. The mention token/anchor is downgraded to plain text and
 * the user is dropped from the content's `mentions` list. Only the mentioned
 * user (not the author) can call this for their own id.
 */
export async function removeMyMention(input: {
  contentType: MentionContentType
  contentId: number
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false, error: "You must be signed in to do that." }
  const meId = session.user.id
  const blocked = new Set([meId])

  if (input.contentType === "post") {
    const [row] = await db
      .select({ text: feedPost.text, mentions: feedPost.mentions })
      .from(feedPost)
      .where(eq(feedPost.id, input.contentId))
      .limit(1)
    if (!row) return { ok: false, error: "Post not found." }
    const isMentioned = (row.mentions ?? []).some((m) => m.userId === meId)
    if (!isMentioned) return { ok: false, error: "You are not tagged in this post." }

    const nextText = downgradeBlockedMentions(row.text, blocked)
    const nextMentions = (row.mentions ?? []).filter((m) => m.userId !== meId)
    await db
      .update(feedPost)
      .set({ text: nextText, mentions: nextMentions.length ? nextMentions : null })
      .where(eq(feedPost.id, input.contentId))
    revalidatePath("/feed")
    return { ok: true }
  }

  const [row] = await db
    .select({ bodyHtml: article.bodyHtml, mentions: article.mentions })
    .from(article)
    .where(eq(article.id, input.contentId))
    .limit(1)
  if (!row) return { ok: false, error: "Article not found." }
  const isMentioned = (row.mentions ?? []).some((m) => m.userId === meId)
  if (!isMentioned) return { ok: false, error: "You are not tagged in this article." }

  const nextHtml = downgradeBlockedHtmlMentions(row.bodyHtml, blocked)
  const nextMentions = (row.mentions ?? []).filter((m) => m.userId !== meId)
  await db
    .update(article)
    .set({ bodyHtml: nextHtml, mentions: nextMentions.length ? nextMentions : null })
    .where(eq(article.id, input.contentId))
  revalidatePath("/articles")
  return { ok: true }
}

/**
 * Reports an inappropriate mention for admin moderation. Reuses the shared
 * content_report queue with a dedicated `mention` content type so it surfaces
 * alongside other reports. `contentId` encodes the surface + id + tagged user
 * so moderators can locate it (e.g. "post:42:u_123").
 */
export async function reportMention(input: {
  contentType: MentionContentType
  contentId: number
  mentionedUserId: string
  reason?: string
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false, error: "You must be signed in to do that." }

  await db.insert(contentReport).values({
    id: randomUUID(),
    contentType: "mention",
    contentId: `${input.contentType}:${input.contentId}:${input.mentionedUserId}`,
    reporterId: session.user.id,
    reason: input.reason?.trim() || "Inappropriate mention",
  })
  return { ok: true }
}
