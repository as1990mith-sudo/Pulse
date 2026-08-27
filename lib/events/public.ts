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

  const rows = await db
    .select({
      ad: announcement,
      // Seats (summed party sizes), not rows. Capacity is enforced against
      // seats, so counting registrations here would let a card advertise places
      // that cannot actually be booked.
      registered: sql<number>`(
        select coalesce(sum(${eventRegistration.guests}), 0)::int from ${eventRegistration}
        where ${eventRegistration.announcementId} = ${announcement.id}
          and ${eventRegistration.status} = 'registered'
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

  console.log("[v0] listPublicEvents rows:", JSON.stringify(rows.map((r) => ({ id: r.ad.id, reg: r.registered }))))

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
