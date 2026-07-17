"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { announcement, announcementInteraction, dmConversation, dmMessage } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { getAdminUser, requireAdmin } from "@/lib/admin"
import { AD_MAX_HOURS, AD_BLOCK_HOURS, FREQUENCY_TEAM_ID, type AdType, type AdAction } from "@/lib/ads"

export type AnnouncementView = {
  id: number
  userId: string
  creatorName: string
  adType: AdType
  title: string
  description: string | null
  flyer: string | null
  location: string | null
  eventDate: string | null
  eventTime: string | null
  price: string | null
  durationHours: number
  status: "pending" | "approved" | "declined"
  declineReason: string | null
  expiresAt: string | null
  isOwner: boolean
  // Per-viewer interaction state (null when not signed in or no row yet).
  myAction: AdAction | null
  // Whether THIS viewer has the ad hidden right now.
  hiddenByMe: boolean
}

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")
  return user
}

/** Lazily flip approved ads to expired once their paid window has elapsed. */
async function expireDueAnnouncements() {
  await db
    .update(announcement)
    .set({ status: "declined", declineReason: "Expired" })
    .where(and(eq(announcement.status, "approved"), lte(announcement.expiresAt, new Date())))
}

function toView(
  row: typeof announcement.$inferSelect,
  currentUserId: string | null,
  interaction?: { action: string | null; hidden: boolean },
): AnnouncementView {
  return {
    id: row.id,
    userId: row.userId,
    creatorName: row.creatorName,
    adType: (row.adType as AdType) ?? "event",
    title: row.title,
    description: row.description,
    flyer: row.flyer,
    location: row.location,
    eventDate: row.eventDate,
    eventTime: row.eventTime,
    price: row.price,
    durationHours: row.durationHours,
    status: row.status as AnnouncementView["status"],
    declineReason: row.declineReason,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isOwner: currentUserId === row.userId,
    myAction: (interaction?.action as AdAction | null) ?? null,
    hiddenByMe: interaction?.hidden ?? false,
  }
}

/** Loads this user's interaction rows for a set of advert ids, keyed by ad id. */
async function loadInteractions(adIds: number[], userId: string | null) {
  const map = new Map<number, { action: string | null; hidden: boolean }>()
  if (!userId || adIds.length === 0) return map
  const rows = await db
    .select()
    .from(announcementInteraction)
    .where(
      and(eq(announcementInteraction.userId, userId), inArray(announcementInteraction.announcementId, adIds)),
    )
  for (const r of rows) map.set(r.announcementId, { action: r.action, hidden: r.hidden })
  return map
}

/** Active (approved, not yet expired) banners shown to everyone on the feed. */
export async function getActiveAnnouncements(): Promise<AnnouncementView[]> {
  await expireDueAnnouncements()
  const user = await getCurrentUser()
  const rows = await db
    .select()
    .from(announcement)
    .where(and(eq(announcement.status, "approved"), gt(announcement.expiresAt, new Date())))
    .orderBy(asc(announcement.eventDate))
  const interactions = await loadInteractions(
    rows.map((r) => r.id),
    user?.id ?? null,
  )
  return rows.map((r) => toView(r, user?.id ?? null, interactions.get(r.id)))
}

/** The signed-in user's own requests, so they can track pending/declined status. */
export async function getMyAnnouncements(): Promise<AnnouncementView[]> {
  const user = await getCurrentUser()
  if (!user) return []
  await expireDueAnnouncements()
  const rows = await db
    .select()
    .from(announcement)
    .where(eq(announcement.userId, user.id))
    .orderBy(desc(announcement.createdAt))
  const interactions = await loadInteractions(
    rows.map((r) => r.id),
    user.id,
  )
  return rows.map((r) => toView(r, user.id, interactions.get(r.id)))
}

export async function createAnnouncement(input: {
  adType: AdType
  title: string
  description?: string | null
  flyer?: string | null
  location?: string | null
  eventDate?: string | null
  eventTime?: string | null
  price?: string | null
  durationHours: number
}): Promise<{ status: "approved" | "declined"; declineReason?: string }> {
  const user = await requireUser()
  const adType: AdType = input.adType === "product" ? "product" : "event"
  const title = input.title.trim()
  if (!title) throw new Error(adType === "product" ? "Product name is required." : "Event title is required.")

  // Type-specific required fields.
  let eventDate: string | null = null
  let eventTime: string | null = null
  let location: string | null = null
  let price: string | null = null

  if (adType === "event") {
    if (!input.eventDate) throw new Error("Event date is required.")
    if (!input.eventTime) throw new Error("Event time is required.")
    if (!input.location?.trim()) throw new Error("Event venue is required.")
    if (input.eventDate < new Date().toISOString().slice(0, 10)) {
      throw new Error("The event date must be today or in the future.")
    }
    eventDate = input.eventDate
    eventTime = input.eventTime
    location = input.location.trim()
    // Events can be free or paid. A blank/absent price means free (null);
    // otherwise store the ticket price the creator set.
    const rawTicket = (input.price ?? "").trim().replace(/^\$/, "").trim()
    price = rawTicket || null
  } else {
    const raw = (input.price ?? "").trim().replace(/^\$/, "").trim()
    if (!raw) throw new Error("Product price is required.")
    price = raw
  }

  const hours = Math.min(AD_MAX_HOURS, Math.max(AD_BLOCK_HOURS, input.durationHours))

  // Singleton: only ONE live advert is allowed at a time. If any approved,
  // not-yet-expired advert already exists, block the new request entirely.
  await expireDueAnnouncements()
  const [taken] = await db
    .select({ id: announcement.id })
    .from(announcement)
    .where(and(eq(announcement.status, "approved"), gt(announcement.expiresAt, new Date())))
    .limit(1)

  if (taken) {
    throw new Error(
      "There's already a live advert running. Only one advert can be active at a time — please try again once the current one expires.",
    )
  }

  const approved = true
  const now = new Date()
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000)
  const declineReason = null

  await db.insert(announcement).values({
    userId: user.id,
    creatorName: user.name,
    adType,
    title,
    description: input.description?.trim() || null,
    flyer: input.flyer || null,
    location,
    eventDate,
    eventTime,
    price,
    durationHours: hours,
    status: approved ? "approved" : "declined",
    declineReason,
    publishedAt: approved ? now : null,
    expiresAt,
  })

  revalidatePath("/feed")
  return approved ? { status: "approved" } : { status: "declined", declineReason: declineReason! }
}

/**
 * Remove a request. Allowed only while it is NOT a live approved ad. Approved
 * ads cannot be deleted or edited — they auto-disappear when the paid duration
 * elapses.
 */
export async function deleteAnnouncement(id: number) {
  const user = await requireUser()
  const [row] = await db.select().from(announcement).where(eq(announcement.id, id))
  if (!row) return
  if (row.userId !== user.id) throw new Error("You can only remove your own adverts.")
  if (row.status === "approved" && row.expiresAt && row.expiresAt > new Date()) {
    throw new Error("Approved adverts cannot be removed. They disappear automatically when the duration is due.")
  }
  await db.delete(announcement).where(and(eq(announcement.id, id), eq(announcement.userId, user.id)))
  revalidatePath("/feed")
}

/**
 * Platform-admin removal of any advert, including a live approved one. Used by
 * the inline "remove" control admins see on banners. Frees the singleton slot
 * so a new advert can be posted immediately.
 */
export async function adminDeleteAnnouncement(id: number) {
  await requireAdmin()
  await db.delete(announcement).where(eq(announcement.id, id))
  revalidatePath("/feed")
  revalidatePath("/admin")
}

/** Fetches a live advert by id, ensuring it is still approved and unexpired. */
async function getLiveAnnouncement(id: number) {
  const [row] = await db.select().from(announcement).where(eq(announcement.id, id)).limit(1)
  if (!row) throw new Error("This advert is no longer available.")
  return row
}

/** Upserts the viewer's interaction row for an advert. */
async function upsertInteraction(
  announcementId: number,
  userId: string,
  patch: { action?: AdAction | null; hidden?: boolean },
) {
  const [existing] = await db
    .select()
    .from(announcementInteraction)
    .where(
      and(eq(announcementInteraction.announcementId, announcementId), eq(announcementInteraction.userId, userId)),
    )
    .limit(1)

  if (existing) {
    await db
      .update(announcementInteraction)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(announcementInteraction.id, existing.id))
  } else {
    await db.insert(announcementInteraction).values({
      announcementId,
      userId,
      action: patch.action ?? null,
      hidden: patch.hidden ?? false,
    })
  }
}

/**
 * A viewer taps "Want to know more" or "Not interested". Records the action and
 * hides the ad for them. "Want to know more" also DMs the creator an interest
 * message that includes the advert title.
 */
export async function interactWithAnnouncement(input: { id: number; action: AdAction }) {
  const user = await requireUser()
  const ad = await getLiveAnnouncement(input.id)
  if (ad.userId === user.id) throw new Error("This is your own advert.")

  await upsertInteraction(input.id, user.id, { action: input.action, hidden: true })

  if (input.action === "interested") {
    await sendInterestMessage(ad.userId, user.id, ad.title)
  }

  revalidatePath("/feed")
}

/** Sends "I am interested in '<title>'. Can I know more?" from viewer to creator. */
async function sendInterestMessage(creatorId: string, viewerId: string, title: string) {
  const [userAId, userBId] = viewerId < creatorId ? [viewerId, creatorId] : [creatorId, viewerId]
  let [conv] = await db
    .select()
    .from(dmConversation)
    .where(and(eq(dmConversation.userAId, userAId), eq(dmConversation.userBId, userBId)))
    .limit(1)
  if (!conv) {
    ;[conv] = await db.insert(dmConversation).values({ userAId, userBId }).returning()
  }
  await db.insert(dmMessage).values({
    conversationId: conv.id,
    senderId: viewerId,
    body: `I am interested in "${title}". Can I know more?`,
  })
  await db.update(dmConversation).set({ lastMessageAt: new Date() }).where(eq(dmConversation.id, conv.id))
  revalidatePath("/messages")
  revalidatePath(`/messages/${conv.id}`)
}

/**
 * Toggles whether the viewer currently has the advert hidden. Only permitted
 * once they've interacted (the UI enforces this too).
 */
export async function setAnnouncementHidden(input: { id: number; hidden: boolean }) {
  const user = await requireUser()
  await getLiveAnnouncement(input.id)
  await upsertInteraction(input.id, user.id, { hidden: input.hidden })
  revalidatePath("/feed")
}

/**
 * The creator hides/shows their OWN advert from their interface. Stored as an
 * interaction row with a null action (no interest recorded).
 */
export async function setOwnAnnouncementHidden(input: { id: number; hidden: boolean }) {
  const user = await requireUser()
  const ad = await getLiveAnnouncement(input.id)
  if (ad.userId !== user.id) throw new Error("You can only hide your own advert.")
  await upsertInteraction(input.id, user.id, { hidden: input.hidden })
  revalidatePath("/feed")
}

/**
 * Admin action: message the advert creator from the official "Frequency Team"
 * account. The conversation is flagged priority so it stays pinned to the top
 * of the creator's inbox until they open it.
 */
export async function adminMessageCreator(input: { announcementId: number; body: string }) {
  await requireAdmin()
  const body = input.body.trim()
  if (!body) throw new Error("Message cannot be empty.")
  const ad = await getLiveAnnouncement(input.announcementId)
  const creatorId = ad.userId

  const [userAId, userBId] =
    FREQUENCY_TEAM_ID < creatorId ? [FREQUENCY_TEAM_ID, creatorId] : [creatorId, FREQUENCY_TEAM_ID]
  let [conv] = await db
    .select()
    .from(dmConversation)
    .where(and(eq(dmConversation.userAId, userAId), eq(dmConversation.userBId, userBId)))
    .limit(1)
  if (!conv) {
    ;[conv] = await db.insert(dmConversation).values({ userAId, userBId, priority: true }).returning()
  } else {
    await db.update(dmConversation).set({ priority: true }).where(eq(dmConversation.id, conv.id))
  }

  await db.insert(dmMessage).values({ conversationId: conv.id, senderId: FREQUENCY_TEAM_ID, body })
  await db.update(dmConversation).set({ lastMessageAt: new Date() }).where(eq(dmConversation.id, conv.id))
  revalidatePath("/messages")
  revalidatePath(`/messages/${conv.id}`)
}

/** Whether the signed-in user is a platform admin (drives the admin UI). */
export async function isPlatformAdmin(): Promise<boolean> {
  return (await getAdminUser()) !== null
}
