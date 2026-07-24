import { desc, eq, gt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { broadcast, pushCampaign, notification, user, session, adminMember } from "@/lib/db/schema"
import type { Audience, BroadcastRow, BroadcastStatus } from "./broadcast-types"

export { AUDIENCES } from "./broadcast-types"
export type { Audience, BroadcastRow, BroadcastStatus } from "./broadcast-types"

/** Resolves an audience segment to the concrete set of recipient user ids. */
export async function resolveAudience(audience: Audience): Promise<string[]> {
  if (audience === "verified") {
    const rows = await db.select({ id: user.id }).from(user).where(eq(user.emailVerified, true))
    return rows.map((r) => r.id)
  }
  if (audience === "admins") {
    const rows = await db.select({ id: adminMember.userId }).from(adminMember)
    return [...new Set(rows.map((r) => r.id))]
  }
  if (audience === "active") {
    const rows = await db
      .selectDistinct({ id: session.userId })
      .from(session)
      .where(gt(session.updatedAt, sql`now() - interval '30 days'`))
    return rows.map((r) => r.id)
  }
  // everyone
  const rows = await db.select({ id: user.id }).from(user)
  return rows.map((r) => r.id)
}

/** Counts of each audience segment, for the composer preview. */
export async function getAudienceSizes(): Promise<Record<Audience, number>> {
  const [everyone, verified, admins, active] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(user),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(user).where(eq(user.emailVerified, true)),
    db.select({ n: sql<number>`count(distinct ${adminMember.userId})`.mapWith(Number) }).from(adminMember),
    db
      .select({ n: sql<number>`count(distinct ${session.userId})`.mapWith(Number) })
      .from(session)
      .where(gt(session.updatedAt, sql`now() - interval '30 days'`)),
  ])
  return {
    everyone: everyone[0]?.n ?? 0,
    verified: verified[0]?.n ?? 0,
    admins: admins[0]?.n ?? 0,
    active: active[0]?.n ?? 0,
  }
}

/**
 * Delivers a message to an audience as in-app notifications — one row per
 * recipient. Inserts are chunked so large audiences don't exceed parameter
 * limits. Returns the number of recipients reached.
 */
export async function deliverToAudience(
  audience: Audience,
  opts: { actorName: string; title: string; message: string; link?: string; type?: string },
): Promise<number> {
  const recipients = await resolveAudience(audience)
  if (recipients.length === 0) return 0

  const now = new Date()
  const rows = recipients.map((userId) => ({
    userId,
    actorId: "system",
    actorName: opts.actorName || "Frequency",
    type: opts.type ?? "broadcast",
    message: opts.title ? `${opts.title}: ${opts.message}` : opts.message,
    link: opts.link ?? "/notifications",
    read: false,
    createdAt: now,
  }))

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(notification).values(rows.slice(i, i + CHUNK))
  }
  return recipients.length
}

/** Lists broadcasts and push campaigns together, newest first. */
export async function listBroadcasts(): Promise<BroadcastRow[]> {
  const [bc, pc] = await Promise.all([
    db.select().from(broadcast).orderBy(desc(broadcast.createdAt)).limit(50),
    db.select().from(pushCampaign).orderBy(desc(pushCampaign.createdAt)).limit(50),
  ])

  const mapped: BroadcastRow[] = [
    ...bc.map((b) => ({
      id: b.id,
      type: b.type,
      title: b.title,
      body: b.body,
      audience: b.audience as Audience,
      status: b.status as BroadcastStatus,
      scheduledFor: b.scheduledFor ? b.scheduledFor.toISOString() : null,
      sentAt: b.sentAt ? b.sentAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
      channel: "in_app" as const,
      recipientCount: null,
    })),
    ...pc.map((p) => ({
      id: p.id,
      type: "push",
      title: p.title,
      body: p.body,
      audience: p.audience as Audience,
      status: p.status as BroadcastStatus,
      scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
      sentAt: p.sentAt ? p.sentAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      channel: "push" as const,
      recipientCount: p.recipientCount,
    })),
  ]

  return mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export type BroadcastAnalytics = {
  totalSent: number
  scheduled: number
  drafts: number
  totalRecipients: number
}

/** Headline analytics across both channels. */
export async function getBroadcastAnalytics(): Promise<BroadcastAnalytics> {
  const all = await listBroadcasts()
  return {
    totalSent: all.filter((b) => b.status === "sent").length,
    scheduled: all.filter((b) => b.status === "scheduled").length,
    drafts: all.filter((b) => b.status === "draft").length,
    totalRecipients: all.reduce((sum, b) => sum + (b.recipientCount ?? 0), 0),
  }
}
