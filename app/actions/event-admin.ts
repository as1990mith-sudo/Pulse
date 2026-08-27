"use server"

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { announcement, eventContact, eventRegistration } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { homeRoleHasPermission } from "@/lib/home/roles"
import type { EventQuestion } from "@/lib/events/questions"

/**
 * Asserts the caller may manage this Home's events, and returns the Home.
 *
 * Every admin read below funnels through here. The Home is derived from the
 * caller's own membership rather than from anything in the request body, which
 * is what makes the `homeId` equality checks further down meaningful: an admin
 * of Home A cannot reach Home B's registrants by guessing an event id.
 */
// Matches the per-file convention used across app/actions/*.
async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")
  return user
}

async function requireEventsManager(handle: string) {
  const user = await requireUser()
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, "events.manage")) {
    throw new Error("You don't have permission to view event registrations.")
  }
  return { user, home }
}

export type RegistrationCounts = {
  /** Distinct people holding a place. */
  total: number
  members: number
  nonMembers: number
  /** Places taken once party sizes are included; what capacity is measured in. */
  seats: number
  attended: number
}

export type EventRegistrationSummary = {
  id: number
  title: string
  eventDate: string | null
  eventTime: string | null
  registrationEnabled: boolean
  publicPageEnabled: boolean
  capacity: number | null
  questions: EventQuestion[]
  counts: RegistrationCounts
}

const EMPTY_COUNTS: RegistrationCounts = { total: 0, members: 0, nonMembers: 0, seats: 0, attended: 0 }

/**
 * Every event this Home has published, each with its live registration counts.
 *
 * Counts are produced by a single grouped aggregate over all of the Home's
 * events rather than a per-event correlated subquery — one round trip, and it
 * sidesteps the Drizzle raw-`sql` correlation trap entirely.
 */
export async function getHomeEventRegistrations(handle: string): Promise<EventRegistrationSummary[]> {
  const { home } = await requireEventsManager(handle)

  const events = await db
    .select({
      id: announcement.id,
      title: announcement.title,
      eventDate: announcement.eventDate,
      eventTime: announcement.eventTime,
      registrationEnabled: announcement.registrationEnabled,
      publicPageEnabled: announcement.publicPageEnabled,
      capacity: announcement.capacity,
      questions: announcement.questions,
    })
    .from(announcement)
    .where(and(eq(announcement.homeId, home.id), eq(announcement.adType, "event")))
    .orderBy(desc(announcement.eventDate), desc(announcement.id))

  if (events.length === 0) return []

  const ids = events.map((e) => e.id)
  const grouped = await db
    .select({
      announcementId: eventRegistration.announcementId,
      total: sql<number>`count(*)::int`,
      members: sql<number>`count(*) filter (where ${eventRegistration.isMember})::int`,
      nonMembers: sql<number>`count(*) filter (where not ${eventRegistration.isMember})::int`,
      seats: sql<number>`coalesce(sum(${eventRegistration.guests}), 0)::int`,
      attended: sql<number>`count(*) filter (where ${eventRegistration.attendedAt} is not null)::int`,
    })
    .from(eventRegistration)
    .where(
      and(
        inArray(eventRegistration.announcementId, ids),
        // Home-scoped as well as id-scoped: defence in depth, so a stray id
        // belonging to another Home could never contribute to these counts.
        eq(eventRegistration.homeId, home.id),
        eq(eventRegistration.status, "registered"),
      ),
    )
    .groupBy(eventRegistration.announcementId)

  const byEvent = new Map(grouped.map((g) => [g.announcementId, g]))

  return events.map((e) => {
    const g = byEvent.get(e.id)
    return {
      id: e.id,
      title: e.title,
      eventDate: e.eventDate,
      eventTime: e.eventTime,
      registrationEnabled: e.registrationEnabled,
      publicPageEnabled: e.publicPageEnabled,
      capacity: e.capacity,
      questions: Array.isArray(e.questions) ? (e.questions as EventQuestion[]) : [],
      counts: g
        ? { total: g.total, members: g.members, nonMembers: g.nonMembers, seats: g.seats, attended: g.attended }
        : EMPTY_COUNTS,
    }
  })
}

export type RegistrationRow = {
  id: number
  contactId: number
  fullName: string
  email: string
  phone: string | null
  isMember: boolean
  guests: number
  source: string
  status: string
  attendedAt: string | null
  createdAt: string
  answers: Record<string, string | number | boolean> | null
  marketingOptIn: boolean
}

export type RegistrationFilter = "all" | "members" | "non_members" | "attended"

/**
 * The registrant list for one event, with search and filter applied server-side.
 *
 * Searching and filtering happen in SQL rather than in the client so the browser
 * never receives rows the admin did not ask for — with personal data, "filtered
 * in the UI" still means "sent over the wire".
 */
export async function listEventRegistrations(input: {
  handle: string
  announcementId: number
  query?: string
  filter?: RegistrationFilter
}): Promise<{ rows: RegistrationRow[]; counts: RegistrationCounts }> {
  const { home } = await requireEventsManager(input.handle)

  // Confirm the event belongs to THIS Home before returning any personal data.
  const [event] = await db
    .select({ id: announcement.id })
    .from(announcement)
    .where(and(eq(announcement.id, input.announcementId), eq(announcement.homeId, home.id)))
    .limit(1)
  if (!event) throw new Error("Event not found.")

  const filter = input.filter ?? "all"
  const q = input.query?.trim()

  const conditions = [
    eq(eventRegistration.announcementId, input.announcementId),
    eq(eventRegistration.homeId, home.id),
    eq(eventRegistration.status, "registered"),
  ]
  if (filter === "members") conditions.push(eq(eventRegistration.isMember, true))
  if (filter === "non_members") conditions.push(eq(eventRegistration.isMember, false))
  if (filter === "attended") conditions.push(sql`${eventRegistration.attendedAt} is not null`)
  if (q) {
    const like = `%${q}%`
    // ilike keeps the match case-insensitive, matching how people actually type
    // a name into a search box.
    const term = or(
      ilike(eventRegistration.fullName, like),
      ilike(eventRegistration.email, like),
      ilike(eventRegistration.phone, like),
    )
    if (term) conditions.push(term)
  }

  const rows = await db
    .select({
      id: eventRegistration.id,
      contactId: eventRegistration.contactId,
      fullName: eventRegistration.fullName,
      email: eventRegistration.email,
      phone: eventRegistration.phone,
      isMember: eventRegistration.isMember,
      guests: eventRegistration.guests,
      source: eventRegistration.source,
      status: eventRegistration.status,
      attendedAt: eventRegistration.attendedAt,
      createdAt: eventRegistration.createdAt,
      answers: eventRegistration.answers,
      marketingOptIn: eventContact.marketingOptIn,
    })
    .from(eventRegistration)
    .innerJoin(eventContact, eq(eventContact.id, eventRegistration.contactId))
    .where(and(...conditions))
    .orderBy(asc(eventRegistration.fullName), asc(eventRegistration.id))

  // Counts describe the WHOLE event, not the filtered view, so the header totals
  // stay stable while an admin types in the search box.
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      members: sql<number>`count(*) filter (where ${eventRegistration.isMember})::int`,
      nonMembers: sql<number>`count(*) filter (where not ${eventRegistration.isMember})::int`,
      seats: sql<number>`coalesce(sum(${eventRegistration.guests}), 0)::int`,
      attended: sql<number>`count(*) filter (where ${eventRegistration.attendedAt} is not null)::int`,
    })
    .from(eventRegistration)
    .where(
      and(
        eq(eventRegistration.announcementId, input.announcementId),
        eq(eventRegistration.homeId, home.id),
        eq(eventRegistration.status, "registered"),
      ),
    )

  return {
    rows: rows.map((r) => ({
      ...r,
      attendedAt: r.attendedAt ? r.attendedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
    counts: totals ?? EMPTY_COUNTS,
  }
}

export type ContactHistoryEntry = {
  registrationId: number
  announcementId: number
  title: string
  eventDate: string | null
  isMember: boolean
  guests: number
  attendedAt: string | null
  status: string
  createdAt: string
}

/**
 * Every event one contact has registered for within this Home.
 *
 * Deliberately Home-scoped: the same person may exist as a contact in several
 * Homes, and one Home's admin has no business seeing another Home's history for
 * them. Cancelled rows are included — "registered then withdrew" is genuinely
 * useful pastoral context, and hiding it would misrepresent the record.
 */
export async function getContactEventHistory(input: {
  handle: string
  contactId: number
}): Promise<ContactHistoryEntry[]> {
  const { home } = await requireEventsManager(input.handle)

  const rows = await db
    .select({
      registrationId: eventRegistration.id,
      announcementId: eventRegistration.announcementId,
      title: announcement.title,
      eventDate: announcement.eventDate,
      isMember: eventRegistration.isMember,
      guests: eventRegistration.guests,
      attendedAt: eventRegistration.attendedAt,
      status: eventRegistration.status,
      createdAt: eventRegistration.createdAt,
    })
    .from(eventRegistration)
    .innerJoin(announcement, eq(announcement.id, eventRegistration.announcementId))
    .where(and(eq(eventRegistration.contactId, input.contactId), eq(eventRegistration.homeId, home.id)))
    .orderBy(desc(announcement.eventDate), desc(eventRegistration.id))

  return rows.map((r) => ({
    ...r,
    attendedAt: r.attendedAt ? r.attendedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }))
}
