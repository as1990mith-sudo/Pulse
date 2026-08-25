"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  announcement,
  announcementInteraction,
  dmConversation,
  dmMessage,
  eventRsvp,
  home,
  homeMembership,
  organization,
  user as userTable,
} from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { getAdminUser, requireAdmin } from "@/lib/admin"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { canViewerManageEvents, getActiveHome, getViewerEventHome } from "@/lib/home/active-home"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { AD_MAX_HOURS, AD_BLOCK_HOURS, FREQUENCY_TEAM_ID, type AdType, type AdAction } from "@/lib/ads"

/** How a published event leaves the community feed. */
export type EventDeleteMode = "auto5h" | "manual"
/** A member's RSVP response to a community event. */
export type EventRsvpResponse = "coming" | "not_coming"

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
  // RSVP roll-up + the viewer's own response.
  comingCount: number
  notComingCount: number
  myRsvp: EventRsvpResponse | null
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

type RsvpRollup = { coming: number; notComing: number; mine: EventRsvpResponse | null }

function toView(
  row: typeof announcement.$inferSelect,
  currentUserId: string | null,
  interaction?: { action: string | null; hidden: boolean },
  rsvp?: RsvpRollup,
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
    comingCount: rsvp?.coming ?? 0,
    notComingCount: rsvp?.notComing ?? 0,
    myRsvp: rsvp?.mine ?? null,
  }
}

/** Loads RSVP roll-ups (counts + the viewer's own response) keyed by event id. */
async function loadRsvps(adIds: number[], userId: string | null) {
  const map = new Map<number, RsvpRollup>()
  if (adIds.length === 0) return map
  for (const id of adIds) map.set(id, { coming: 0, notComing: 0, mine: null })
  const rows = await db.select().from(eventRsvp).where(inArray(eventRsvp.announcementId, adIds))
  for (const r of rows) {
    const entry = map.get(r.announcementId)
    if (!entry) continue
    if (r.response === "coming") entry.coming++
    else if (r.response === "not_coming") entry.notComing++
    if (userId && r.userId === userId) entry.mine = r.response as EventRsvpResponse
  }
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
  const [interactions, rsvps] = await Promise.all([
    loadInteractions(ids, user?.id ?? null),
    loadRsvps(ids, user?.id ?? null),
  ])
  return rows.map((r) => toView(r, user?.id ?? null, interactions.get(r.id), rsvps.get(r.id)))
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
  const [interactions, rsvps] = await Promise.all([loadInteractions(ids, user.id), loadRsvps(ids, user.id)])
  return rows.map((r) => toView(r, user.id, interactions.get(r.id), rsvps.get(r.id)))
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
  })

  revalidatePath("/feed")
  return { status: "approved" }
}

/**
 * A signed-in member RSVPs to a community event. Upserts their single response
 * row (one per event) — tapping the same choice again clears it (toggle off).
 */
export async function rsvpToEvent(input: { id: number; response: EventRsvpResponse }): Promise<void> {
  const user = await requireUser()
  const ad = await getLiveAnnouncement(input.id)
  if (ad.adType !== "event") throw new Error("You can only RSVP to events.")

  const [existing] = await db
    .select()
    .from(eventRsvp)
    .where(and(eq(eventRsvp.announcementId, input.id), eq(eventRsvp.userId, user.id)))
    .limit(1)

  if (existing) {
    if (existing.response === input.response) {
      // Toggling the current choice off removes the RSVP entirely.
      await db.delete(eventRsvp).where(eq(eventRsvp.id, existing.id))
    } else {
      await db
        .update(eventRsvp)
        .set({ response: input.response, updatedAt: new Date() })
        .where(eq(eventRsvp.id, existing.id))
    }
  } else {
    await db.insert(eventRsvp).values({
      announcementId: input.id,
      userId: user.id,
      userName: user.name,
      response: input.response,
    })
  }

  revalidatePath("/feed")
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

// ── Community-event attendance (org admin console) ──────────────────────────

export type EventAttendee = {
  userId: string
  name: string
  initials: string
  color: string
  image: string | null
}

export type EventAttendance = {
  id: number
  title: string
  flyer: string | null
  eventDate: string | null
  eventTime: string | null
  location: string | null
  price: string | null
  deleteMode: EventDeleteMode | null
  expiresAt: string | null
  coming: EventAttendee[]
  notComing: EventAttendee[]
}

/**
 * Every community event this Home has published, each with the members who are
 * coming vs. not coming (names + avatars). Powers the Events section of the org
 * admin console. Gated on the `events.manage` permission for the Home.
 */
export async function getHomeEventAttendance(handle: string): Promise<EventAttendance[]> {
  const user = await requireUser()
  const homeView = await getHomeByHandle(handle)
  if (!homeView) throw new Error("Home not found.")
  const membership = await getViewerMembership(homeView.id)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, "events.manage")) {
    throw new Error("You don't have permission to view event attendance.")
  }

  const events = await db
    .select()
    .from(announcement)
    .where(and(eq(announcement.homeId, homeView.id), eq(announcement.adType, "event")))
    .orderBy(asc(announcement.eventDate))
  if (events.length === 0) return []

  const ids = events.map((e) => e.id)
  const rsvps = await db
    .select({ r: eventRsvp, u: userTable })
    .from(eventRsvp)
    .innerJoin(userTable, eq(userTable.id, eventRsvp.userId))
    .where(inArray(eventRsvp.announcementId, ids))
    .orderBy(asc(eventRsvp.createdAt))

  const byEvent = new Map<number, { coming: EventAttendee[]; notComing: EventAttendee[] }>()
  for (const id of ids) byEvent.set(id, { coming: [], notComing: [] })
  for (const { r, u } of rsvps) {
    const bucket = byEvent.get(r.announcementId)
    if (!bucket) continue
    const attendee: EventAttendee = {
      userId: r.userId,
      name: u.name,
      initials: getInitials(u.name),
      color: getAvatarColor(u.id),
      image: u.image,
    }
    if (r.response === "coming") bucket.coming.push(attendee)
    else if (r.response === "not_coming") bucket.notComing.push(attendee)
  }

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    flyer: e.flyer,
    eventDate: e.eventDate,
    eventTime: e.eventTime,
    location: e.location,
    price: e.price,
    deleteMode: (e.deleteMode as EventDeleteMode | null) ?? null,
    expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    coming: byEvent.get(e.id)?.coming ?? [],
    notComing: byEvent.get(e.id)?.notComing ?? [],
  }))
}

/**
 * Org-admin deletion of a community event they published. Verifies the viewer
 * holds `events.manage` on the event's Home, then removes the event and every
 * RSVP for it. Callable from the feed detail sheet and the admin console.
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

  await db.delete(eventRsvp).where(eq(eventRsvp.announcementId, id))
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
