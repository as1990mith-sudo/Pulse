import "server-only"

import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { announcement, eventRegistration, home, organization } from "@/lib/db/schema"
import { getInitials } from "@/lib/identity"

export type PublicEventCard = {
  id: number
  title: string
  description: string | null
  flyer: string | null
  location: string | null
  eventDate: string | null
  eventTime: string | null
  registrationEnabled: boolean
  capacity: number | null
  /** Seats taken (party sizes summed), which is what capacity is measured in. */
  registeredCount: number
  isFull: boolean
  /** Registration open right now (window + capacity). */
  open: boolean
}

export type PublicHostInfo = {
  homeId: string
  name: string
  handle: string
  logo: string | null
  cover: string | null
  description: string | null
  initials: string
}

/**
 * The host organisation behind a public events page.
 *
 * Returns null for a soft-deleted Home so its public pages vanish along with it,
 * exactly as every other Home resolver in the app behaves.
 */
export async function getPublicHost(handle: string): Promise<PublicHostInfo | null> {
  const [row] = await db
    .select({ h: home, org: organization })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(and(eq(organization.handle, handle), isNull(home.deletedAt)))
    .limit(1)
  if (!row) return null
  return {
    homeId: row.h.id,
    name: row.org.name,
    handle: row.org.handle,
    logo: row.org.logo,
    cover: row.org.cover,
    description: row.org.description,
    initials: getInitials(row.org.name),
  }
}

/**
 * Public, upcoming events for a Home that have opted into a public page.
 *
 * Filters on `publicPageEnabled` — NOT merely on registration being enabled — so
 * an admin taking members-only registrations does not accidentally publish the
 * event to the open web. Ordered soonest first.
 *
 * Note this reads `eventDate` (the event's own date) rather than the advert's
 * feed `expiresAt`: a registration page should still be reachable for an event
 * whose feed card has already auto-expired.
 */
export async function listPublicEvents(homeId: string): Promise<PublicEventCard[]> {
  const today = new Date().toISOString().slice(0, 10)

  const q = db
    .select({
      ad: announcement,
      // Seats (summed party sizes), not rows. Capacity is enforced against
      // seats, so counting registrations here would let a card advertise places
      // that cannot actually be booked.
      //
      // Written with an explicit `er` alias and a fully-qualified
      // `announcement.id` rather than interpolated Drizzle columns. Drizzle
      // emits bare, unqualified names inside a raw `sql` template, which
      // produced `where "announcementId" = "id"` — Postgres resolved "id" to
      // event_registration's OWN id, so the subquery compared a registration to
      // itself, matched nothing, and silently reported 0 seats on every event.
      registered: sql<number>`(
        select coalesce(sum(er."guests"), 0)::int
        from "event_registration" er
        where er."announcementId" = "announcement"."id"
          and er."status" = 'registered'
      )`,
    })
    .from(announcement)
    .where(
      and(
        eq(announcement.homeId, homeId),
        eq(announcement.adType, "event"),
        eq(announcement.publicPageEnabled, true),
        eq(announcement.status, "approved"),
        // Upcoming only. Events with no date are always shown so an undated
        // gathering doesn't silently disappear from the listing.
        sql`(${announcement.eventDate} is null or ${announcement.eventDate} >= ${today})`,
      ),
    )
    .orderBy(asc(announcement.eventDate), asc(announcement.eventTime))

  const rows = await q

  const now = new Date()
  return rows.map(({ ad, registered }) => {
    const isFull = ad.capacity !== null && registered >= ad.capacity
    const closed = ad.registrationClosesAt ? ad.registrationClosesAt.getTime() <= now.getTime() : false
    return {
      id: ad.id,
      title: ad.title,
      description: ad.description,
      flyer: ad.flyer,
      location: ad.location,
      eventDate: ad.eventDate,
      eventTime: ad.eventTime,
      registrationEnabled: ad.registrationEnabled,
      capacity: ad.capacity ?? null,
      registeredCount: registered,
      isFull,
      open: ad.registrationEnabled && !isFull && !closed,
    }
  })
}

export type PublicEventBrowserCard = PublicEventCard & {
  /** Event's own date is strictly before today. Undated events are never past. */
  isPast: boolean
}

/**
 * Every public event for a Home — upcoming AND past — for the discovery browser.
 *
 * Unlike {@link listPublicEvents} (upcoming-only, used by simpler surfaces),
 * this keeps past events so the browser can offer a "Past events / View recap"
 * section. Same `publicPageEnabled` + `approved` gate: nothing reaches the open
 * web that an admin didn't publish. Returned upcoming-first (soonest first),
 * then past (most recent first); the caller groups by date.
 */
export async function listPublicEventsForBrowser(homeId: string): Promise<PublicEventBrowserCard[]> {
  const today = new Date().toISOString().slice(0, 10)

  const rows = await db
    .select({
      ad: announcement,
      // See listPublicEvents for why this subquery is written with an explicit
      // `er` alias and fully-qualified announcement.id (Drizzle raw-sql trap).
      registered: sql<number>`(
        select coalesce(sum(er."guests"), 0)::int
        from "event_registration" er
        where er."announcementId" = "announcement"."id"
          and er."status" = 'registered'
      )`,
    })
    .from(announcement)
    .where(
      and(
        eq(announcement.homeId, homeId),
        eq(announcement.adType, "event"),
        eq(announcement.publicPageEnabled, true),
        eq(announcement.status, "approved"),
      ),
    )

  const now = new Date()
  const cards: PublicEventBrowserCard[] = rows.map(({ ad, registered }) => {
    const isFull = ad.capacity !== null && registered >= ad.capacity
    const closed = ad.registrationClosesAt ? ad.registrationClosesAt.getTime() <= now.getTime() : false
    const isPast = ad.eventDate !== null && ad.eventDate < today
    return {
      id: ad.id,
      title: ad.title,
      description: ad.description,
      flyer: ad.flyer,
      location: ad.location,
      eventDate: ad.eventDate,
      eventTime: ad.eventTime,
      registrationEnabled: ad.registrationEnabled,
      capacity: ad.capacity ?? null,
      registeredCount: registered,
      isFull,
      // A past event is never "open" regardless of its registration window.
      open: !isPast && ad.registrationEnabled && !isFull && !closed,
      isPast,
    }
  })

  // Upcoming soonest-first, then past most-recent-first. Undated events sort as
  // upcoming and last within that group (nothing to anchor them earlier).
  const rank = (c: PublicEventBrowserCard) => c.eventDate ?? "9999-12-31"
  return cards.sort((a, b) => {
    if (a.isPast !== b.isPast) return a.isPast ? 1 : -1
    if (a.isPast) return rank(a) < rank(b) ? 1 : rank(a) > rank(b) ? -1 : 0
    return rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0
  })
}

/** Formats an event's date/time for display, tolerant of missing values. */
export function formatEventWhen(date: string | null, time: string | null): string | null {
  if (!date) return time ? time : null
  const parsed = new Date(`${date}T${time && /^\d{2}:\d{2}$/.test(time) ? time : "00:00"}:00`)
  if (Number.isNaN(parsed.getTime())) return null
  const day = parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  return time ? `${day} · ${time}` : day
}
