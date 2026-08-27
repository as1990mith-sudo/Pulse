"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  announcement,
  announcementInteraction,
  dmConversation,
  dmMessage,
  home,
  homeMembership,
  organization,
} from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { getAdminUser, requireAdmin } from "@/lib/admin"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { canViewerManageEvents, getActiveHome, getViewerEventHome } from "@/lib/home/active-home"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import { AD_MAX_HOURS, AD_BLOCK_HOURS, FREQUENCY_TEAM_ID, type AdType, type AdAction } from "@/lib/ads"

/** How a published event leaves the community feed. */
export type EventDeleteMode = "auto5h" | "manual"

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
  // Community-event publishing context (null on legacy paid adverts).
  homeId: string | null
  organizationId: string | null
  deleteMode: EventDeleteMode | null
  // Registration is the only attendance format. Newly published events always
  // have it on; the flag is kept so a legacy row that predates registration
  // can't render a Register CTA that would lead nowhere useful.
  registrationEnabled: boolean
  // The host org's public handle, needed to build the /events/[handle]/[id]
  // link. Null for Universal events, which have no Home and so no handle.
  homeHandle: string | null
}

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")
  return user
}

/**
 * Lazily flip approved ads to expired once their paid window has elapsed.
 *
 * This is a write on a read path, so it's throttled: the feed page calls it
 * twice per load (active + own events) and every visitor paid for a fresh
 * `UPDATE ... WHERE expiresAt <= now()` before a single event could render,
 * which is what made the Events tab feel slow to appear. Running it at most
 * once a minute per server instance keeps expiry effectively immediate — the
 * read below filters on `expiresAt` anyway, so an already-expired event is
 * never shown regardless of whether the flag has been written yet.
 */
let lastExpirySweep = 0
async function expireDueAnnouncements() {
  const now = Date.now()
  if (now - lastExpirySweep < 60_000) return
  lastExpirySweep = now
  await db
    .update(announcement)
    .set({ status: "declined", declineReason: "Expired" })
    .where(and(eq(announcement.status, "approved"), lte(announcement.expiresAt, new Date())))
}

function toView(
  row: typeof announcement.$inferSelect,
  currentUserId: string | null,
  interaction?: { action: string | null; hidden: boolean },
  homeHandle?: string | null,
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
    homeId: row.homeId ?? null,
    organizationId: row.organizationId ?? null,
    deleteMode: (row.deleteMode as EventDeleteMode | null) ?? null,
    registrationEnabled: row.registrationEnabled ?? false,
    homeHandle: homeHandle ?? null,
  }
}

/**
 * Resolves each event's host handle in one query, keyed by `homeId`.
 *
 * Done as a batch lookup rather than a join on the feed queries so the existing
 * `select()` row stays exactly `announcement.$inferSelect` — a join would change
 * the row shape and ripple through every `toView` caller.
 */
async function loadHomeHandles(homeIds: string[]) {
  const map = new Map<string, string>()
  const unique = [...new Set(homeIds)]
  if (unique.length === 0) return map
  const rows = await db
    .select({ homeId: home.id, handle: organization.handle })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(inArray(home.id, unique))
  for (const r of rows) if (r.handle) map.set(r.homeId, r.handle)
  return map
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

/**
 * Active events for the viewer's CURRENT context: approved AND either kept until
 * manually deleted (expiresAt IS NULL) or still within their auto-remove window
 * (expiresAt in the future).
 *
 * Scoped to the active Home so a member only ever sees events belonging to the
 * Home they are currently in — a church's events must not leak into another
 * church's feed. Events with no `homeId` are Universal (platform-wide) and stay
 * visible in every context, including for viewers with no active Home.
 */
export async function getActiveAnnouncements(): Promise<AnnouncementView[]> {
  await expireDueAnnouncements()
  const [user, activeHome] = await Promise.all([getCurrentUser(), getActiveHome()])
  const rows = await db
    .select()
    .from(announcement)
    .where(
      and(
        eq(announcement.status, "approved"),
        or(isNull(announcement.expiresAt), gt(announcement.expiresAt, new Date())),
        // Universal events always show; Home events only inside that Home.
        activeHome
          ? or(isNull(announcement.homeId), eq(announcement.homeId, activeHome.id))
          : isNull(announcement.homeId),
      ),
    )
    .orderBy(asc(announcement.eventDate))
  const ids = rows.map((r) => r.id)
  const [interactions, handles] = await Promise.all([
    loadInteractions(ids, user?.id ?? null),
    loadHomeHandles(rows.flatMap((r) => (r.homeId ? [r.homeId] : []))),
  ])
  return rows.map((r) =>
    toView(r, user?.id ?? null, interactions.get(r.id), r.homeId ? handles.get(r.homeId) : null),
  )
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
  const ids = rows.map((r) => r.id)
  const [interactions, handles] = await Promise.all([
    loadInteractions(ids, user.id),
    loadHomeHandles(rows.flatMap((r) => (r.homeId ? [r.homeId] : []))),
  ])
  return rows.map((r) => toView(r, user.id, interactions.get(r.id), r.homeId ? handles.get(r.homeId) : null))
}

/** Whether the signed-in viewer may publish a community event (drives the UI). */
export async function canPublishEvents(): Promise<boolean> {
  return canViewerManageEvents()
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
  deleteMode: EventDeleteMode
}): Promise<{ status: "approved" | "declined"; declineReason?: string }> {
  const user = await requireUser()
  // Publishing a community event is an organisation privilege: only owners /
  // admins / content-managers of a Home may do it, and the event is stamped
  // with that Home so its attendance surfaces in the Home's admin console. This
  // is the real security boundary — the UI hides the button from members too.
  const eventHome = await getViewerEventHome()
  if (!eventHome) {
    throw new Error("Only organisation owners and admins can publish events.")
  }

  // Only events are supported now — the product option was removed from the UI.
  const adType: AdType = "event"
  const title = input.title.trim()
  if (!title) throw new Error("Event title is required.")

  if (!input.eventDate) throw new Error("Event date is required.")
  if (!input.eventTime) throw new Error("Event time is required.")
  if (!input.location?.trim()) throw new Error("Event venue is required.")
  if (input.eventDate < new Date().toISOString().slice(0, 10)) {
    throw new Error("The event date must be today or in the future.")
  }
  const eventDate = input.eventDate
  const eventTime = input.eventTime
  const location = input.location.trim()
  // Events can be free or paid. A blank/absent price means free (null);
  // otherwise store the ticket price the creator set.
  const rawTicket = (input.price ?? "").trim().replace(/^\$/, "").trim()
  const price = rawTicket || null

  // How the event leaves the feed:
  //  • auto5h  → disappears 5 hours after it starts (expiresAt = start + 5h)
  //  • manual  → stays until an admin deletes it (expiresAt = null)
  const deleteMode: EventDeleteMode = input.deleteMode === "manual" ? "manual" : "auto5h"
  const now = new Date()
  let expiresAt: Date | null = null
  if (deleteMode === "auto5h") {
    const start = new Date(`${eventDate}T${eventTime}:00`)
    expiresAt = Number.isNaN(start.getTime())
      ? new Date(now.getTime() + 5 * 60 * 60 * 1000)
      : new Date(start.getTime() + 5 * 60 * 60 * 1000)
  }

  await db.insert(announcement).values({
    userId: user.id,
    creatorName: eventHome.orgName,
    adType,
    title,
    description: input.description?.trim() || null,
    flyer: input.flyer || null,
    location,
    eventDate,
    eventTime,
    price,
    // Legacy paid-ad column is unused for community events; keep the non-null
    // default satisfied.
    durationHours: 12,
    status: "approved",
    declineReason: null,
    publishedAt: now,
    expiresAt,
    homeId: eventHome.homeId,
    organizationId: eventHome.organizationId,
    deleteMode,
    // Registration is the only attendance format, so publishing always opens it.
    // These were previously left at their `false` defaults with no UI anywhere to
    // turn them on, which is why every published event fell through to RSVP and
    // its registration page 404'd. Capacity, closing date and custom questions
    // stay configurable afterwards; `registrationClosesAt` is how an admin closes
    // registration.
    registrationEnabled: true,
    publicPageEnabled: true,
  })

  revalidatePath("/feed")
  return { status: "approved" }
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

/**
 * Org-admin deletion of a community event they published. Verifies the viewer
 * holds `events.manage` on the event's Home, then removes the event. Callable
 * from the feed detail sheet and the admin console.
 */
export async function orgDeleteEvent(id: number): Promise<void> {
  const user = await requireUser()
  const [row] = await db.select().from(announcement).where(eq(announcement.id, id)).limit(1)
  if (!row) return
  if (!row.homeId) throw new Error("This event can't be managed here.")

  const membership = await getViewerMembership(row.homeId)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, "events.manage")) {
    throw new Error("You don't have permission to remove this event.")
  }

  await db.delete(announcement).where(eq(announcement.id, id))

  revalidatePath("/feed")
  if (row.organizationId) {
    const [org] = await db
      .select({ handle: organization.handle })
      .from(organization)
      .where(eq(organization.id, row.organizationId))
      .limit(1)
    if (org) revalidatePath(`/org/${org.handle}/admin/events`)
  }
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
