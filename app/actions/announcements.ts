"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  announcement,
  announcementInteraction,
  dmConversation,
  dmMessage,
  eventRegistration,
  home,
  homeMembership,
  organization,
} from "@/lib/db/schema"
import { sendEventCancelled, sendEventUpdated, type EventChangeRecipient } from "@/lib/events/email"
import { absoluteShareUrl } from "@/lib/share/site-url"
import { getCurrentUser } from "@/lib/session"
import { getAdminUser, requireAdmin } from "@/lib/admin"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { canViewerManageEvents, getActiveHome, getViewerEventHome } from "@/lib/home/active-home"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import { AD_MAX_HOURS, AD_BLOCK_HOURS, FREQUENCY_TEAM_ID, type AdType, type AdAction } from "@/lib/ads"
import { sanitizeDestinations, type OnlineDestination } from "@/lib/events/online-platforms"

/** How a published event leaves the community feed. */
export type EventDeleteMode = "auto5h" | "manual"

export type AnnouncementView = {
  id: number
  userId: string
  creatorName: string
  adType: AdType
  title: string
  description: string | null
  // Optional admin note with any important information for registrants.
  additionalInfo: string | null
  flyer: string | null
  location: string | null
  // How/where the event happens. Legacy rows (null) are treated as in-person.
  locationMode: "in_person" | "online" | null
  // Confirmed geocode of an in-person venue (null when not geocoded).
  latitude: string | null
  longitude: string | null
  // Selected online destinations with optional links (online events only).
  onlinePlatforms: OnlineDestination[] | null
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
    additionalInfo: row.additionalInfo ?? null,
    flyer: row.flyer,
    location: row.location,
    locationMode: (row.locationMode as AnnouncementView["locationMode"]) ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    onlinePlatforms: (row.onlinePlatforms as OnlineDestination[] | null) ?? null,
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

/**
 * Public, Home-scoped active events for the shareable /events/[handle] page.
 *
 * This powers the SAME members' Events UI (AnnouncementBanner) for visitors with
 * no account or no membership — the public link is byte-for-byte the members'
 * page, just without the app chrome. Two guards keep it safe and correct:
 *  • `publicPageEnabled` — a members-only event never leaks to the open web.
 *  • same approved + unexpired window as the member feed, so the set matches.
 * `homeHandle` is stamped on every row so each card links to its PUBLIC detail
 * page (`/events/[handle]/[id]`) rather than the in-app, auth-gated sheet.
 */
export async function getPublicHomeAnnouncements(homeId: string, handle: string): Promise<AnnouncementView[]> {
  await expireDueAnnouncements()
  const rows = await db
    .select()
    .from(announcement)
    .where(
      and(
        eq(announcement.homeId, homeId),
        eq(announcement.adType, "event"),
        eq(announcement.status, "approved"),
        eq(announcement.publicPageEnabled, true),
        or(isNull(announcement.expiresAt), gt(announcement.expiresAt, new Date())),
      ),
    )
    .orderBy(asc(announcement.eventDate))
  return rows.map((r) => toView(r, null, undefined, handle))
}

/**
 * Normalises an event's location fields for both create and update. Online
 * events must have at least one selected destination and carry no venue/coords;
 * in-person events must have a venue and may carry confirmed coordinates. The
 * `location` column is always kept populated (venue, or "Online") so existing
 * readers that show `location` never render blank.
 */
function resolveEventLocation(input: {
  location?: string | null
  locationMode?: "in_person" | "online" | null
  latitude?: string | null
  longitude?: string | null
  onlinePlatforms?: OnlineDestination[] | null
}): {
  locationMode: "in_person" | "online"
  location: string
  latitude: string | null
  longitude: string | null
  onlinePlatforms: OnlineDestination[] | null
} {
  if (input.locationMode === "online") {
    const destinations = sanitizeDestinations(input.onlinePlatforms)
    if (destinations.length === 0) {
      throw new Error("Pick at least one place the event will take place.")
    }
    return { locationMode: "online", location: "Online", latitude: null, longitude: null, onlinePlatforms: destinations }
  }
  if (!input.location?.trim()) throw new Error("Event venue is required.")
  const coord = (v: string | null | undefined) => {
    const n = typeof v === "string" ? Number(v) : NaN
    return Number.isFinite(n) ? String(n) : null
  }
  return {
    locationMode: "in_person",
    location: input.location.trim(),
    latitude: coord(input.latitude),
    longitude: coord(input.longitude),
    onlinePlatforms: null,
  }
}

/** Distinct active-registrant recipients for an event's lifecycle emails. */
async function eventRegistrantRecipients(announcementId: number): Promise<EventChangeRecipient[]> {
  const rows = await db
    .select({ email: eventRegistration.email, name: eventRegistration.fullName })
    .from(eventRegistration)
    .where(and(eq(eventRegistration.announcementId, announcementId), eq(eventRegistration.status, "registered")))
  const seen = new Set<string>()
  const out: EventChangeRecipient[] = []
  for (const r of rows) {
    if (!r.email) continue
    const key = r.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ email: r.email, name: r.name ?? null })
  }
  return out
}

/** Long-form event date for emails, e.g. "Saturday, 14 June 2026". */
function formatEventDateLabel(date: string | null): string | null {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

export async function createAnnouncement(input: {
  adType: AdType
  title: string
  description?: string | null
  additionalInfo?: string | null
  flyer?: string | null
  location?: string | null
  locationMode?: "in_person" | "online" | null
  latitude?: string | null
  longitude?: string | null
  onlinePlatforms?: OnlineDestination[] | null
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
  if (input.eventDate < new Date().toISOString().slice(0, 10)) {
    throw new Error("The event date must be today or in the future.")
  }
  const eventDate = input.eventDate
  const eventTime = input.eventTime
  // Online (destinations) or in-person (venue + optional coordinates).
  const { locationMode, location, latitude, longitude, onlinePlatforms } = resolveEventLocation(input)
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
    additionalInfo: input.additionalInfo?.trim() || null,
    flyer: input.flyer || null,
    location,
    locationMode,
    latitude,
    longitude,
    onlinePlatforms,
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

  // Gather registrant recipients BEFORE deleting the event — the read still works
  // afterwards (registration rows aren't cascaded), but capturing them first
  // keeps the cancellation notice independent of any future cleanup.
  const recipients = await eventRegistrantRecipients(id)

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

  // Notify everyone holding a place that the event was cancelled. Fail-soft and
  // one send per registrant, at the address they registered with.
  try {
    if (recipients.length > 0) {
      await sendEventCancelled(recipients, {
        eventTitle: row.title,
        homeName: row.creatorName,
        date: formatEventDateLabel(row.eventDate),
        time: row.eventTime,
        location: row.locationMode === "online" ? "Online" : row.location,
        eventUrl: null,
      })
    }
  } catch (err) {
    console.log("[v0] Event cancelled emails failed:", err)
  }
}

/**
 * Org-admin edit of a community event they manage. Verifies the viewer holds
 * `events.manage` on the event's Home (same boundary as {@link orgDeleteEvent}),
 * then updates only the event's own content columns — title, description, flyer,
 * venue, date/time, price, and the auto-delete behaviour. Child rows
 * (registrations, contacts, questions) are never touched, so editing an event's
 * details can't disturb who has already registered.
 */
export async function orgUpdateEvent(
  id: number,
  input: {
    title: string
    description?: string | null
    additionalInfo?: string | null
    flyer?: string | null
    location?: string | null
    locationMode?: "in_person" | "online" | null
    latitude?: string | null
    longitude?: string | null
    onlinePlatforms?: OnlineDestination[] | null
    eventDate?: string | null
    eventTime?: string | null
    price?: string | null
    deleteMode: EventDeleteMode
  },
): Promise<void> {
  const user = await requireUser()
  const [row] = await db.select().from(announcement).where(eq(announcement.id, id)).limit(1)
  if (!row) throw new Error("This event is no longer available.")
  if (!row.homeId) throw new Error("This event can't be managed here.")

  const membership = await getViewerMembership(row.homeId)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, "events.manage")) {
    throw new Error("You don't have permission to edit this event.")
  }

  const title = input.title.trim()
  if (!title) throw new Error("Event title is required.")
  if (!input.eventDate) throw new Error("Event date is required.")
  if (!input.eventTime) throw new Error("Event time is required.")
  if (input.eventDate < new Date().toISOString().slice(0, 10)) {
    throw new Error("The event date must be today or in the future.")
  }
  const eventDate = input.eventDate
  const eventTime = input.eventTime
  // Online (destinations) or in-person (venue + optional coordinates).
  const { locationMode, location, latitude, longitude, onlinePlatforms } = resolveEventLocation(input)
  const rawTicket = (input.price ?? "").trim().replace(/^\$/, "").trim()
  const price = rawTicket || null

  // Recompute when the event leaves the feed, exactly like createAnnouncement:
  // auto5h → 5 hours after the (possibly new) start; manual → never expires.
  const deleteMode: EventDeleteMode = input.deleteMode === "manual" ? "manual" : "auto5h"
  let expiresAt: Date | null = null
  if (deleteMode === "auto5h") {
    const start = new Date(`${eventDate}T${eventTime}:00`)
    expiresAt = Number.isNaN(start.getTime())
      ? new Date(Date.now() + 5 * 60 * 60 * 1000)
      : new Date(start.getTime() + 5 * 60 * 60 * 1000)
  }

  await db
    .update(announcement)
    .set({
      title,
      description: input.description?.trim() || null,
      additionalInfo: input.additionalInfo?.trim() || null,
      flyer: input.flyer || null,
      location,
      locationMode,
      latitude,
      longitude,
      onlinePlatforms,
      eventDate,
      eventTime,
      price,
      deleteMode,
      expiresAt,
    })
    .where(eq(announcement.id, id))

  revalidatePath("/feed")
  let orgHandle: string | null = null
  if (row.organizationId) {
    const [org] = await db
      .select({ handle: organization.handle })
      .from(organization)
      .where(eq(organization.id, row.organizationId))
      .limit(1)
    if (org) {
      orgHandle = org.handle
      revalidatePath(`/org/${org.handle}/admin/events`)
    }
  }

  // Tell everyone holding a place that the details changed. Fail-soft: the edit
  // is already saved, so an email hiccup must not surface as a failed save. Each
  // registrant is emailed individually (no shared recipient list) at the address
  // they registered with.
  try {
    const recipients = await eventRegistrantRecipients(id)
    if (recipients.length > 0) {
      const eventUrl = orgHandle ? await absoluteShareUrl(`/events/${orgHandle}/${id}`) : null
      await sendEventUpdated(recipients, {
        eventTitle: title,
        homeName: row.creatorName,
        date: formatEventDateLabel(eventDate),
        time: eventTime,
        location: locationMode === "online" ? "Online" : location,
        eventUrl,
      })
    }
  } catch (err) {
    console.log("[v0] Event updated emails failed:", err)
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
