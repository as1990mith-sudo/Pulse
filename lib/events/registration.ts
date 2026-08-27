import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  announcement,
  eventContact,
  eventRegistration,
  home,
  homeMembership,
  organization,
  user as userTable,
} from "@/lib/db/schema"

/**
 * The three identities a person can hold, deliberately kept separate.
 *
 * These overlap rather than nest, and collapsing them into a single "status"
 * field is the mistake this type exists to prevent:
 *
 *   hasAccount  they have a Frequency login
 *   isMember    they belong to THIS Home
 *   isRegistrant they have registered for an event of THIS Home
 *
 * Andrew is all three. Jane (external registrant, no login) is only the third.
 * David (has a Frequency account but never joined the Home) is the first and
 * third. Registering only ever sets the third — it never grants the other two.
 */
export type EventIdentity = {
  hasAccount: boolean
  isMember: boolean
  isRegistrant: boolean
}

// Question shapes live in a client-safe module because the registration form
// needs them too, and this file is `server-only`. Re-exported here so server
// callers can keep importing everything from one place.
export { MAX_GUESTS, type EventQuestion, type RegistrationAnswers } from "./questions"

import { MAX_GUESTS, type EventQuestion, type RegistrationAnswers } from "./questions"

/**
 * Normalises an email for identity matching.
 *
 * Trim + lowercase only. Deliberately NOT doing gmail-style dot-stripping or
 * plus-tag removal: those rules are provider-specific, and applying them
 * universally would merge two genuinely different people who happen to use a
 * provider that treats addresses differently. Under-matching creates a
 * duplicate contact an admin can see and reconcile; over-matching silently
 * hands one person's registration history to another.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Trims a phone number without reformatting it.
 *
 * No canonicalisation: Frequency is international, and rewriting "07931 288485"
 * into an assumed +44 would corrupt numbers from other countries. Stored as the
 * person typed it so an admin can always read and dial it.
 */
export function normalisePhone(phone: string | null | undefined): string | null {
  const trimmed = (phone ?? "").trim()
  return trimmed.length > 0 ? trimmed : null
}

export type EventRegistrationConfig = {
  enabled: boolean
  publicPage: boolean
  capacity: number | null
  closesAt: Date | null
  questions: EventQuestion[]
  requiresPhone: boolean
}

/** Reads the registration configuration off an announcement row. */
export function readConfig(row: typeof announcement.$inferSelect): EventRegistrationConfig {
  return {
    enabled: row.registrationEnabled,
    publicPage: row.publicPageEnabled,
    capacity: row.capacity ?? null,
    closesAt: row.registrationClosesAt ?? null,
    questions: (row.questions ?? []) as EventQuestion[],
    requiresPhone: row.requiresPhone,
  }
}

/**
 * Whether registration is currently open.
 *
 * Intentionally independent of the feed advert's `expiresAt`. An event's feed
 * card may auto-disappear 5 hours after it starts, but its registration page has
 * its own lifetime — so this checks the explicit `registrationClosesAt` and the
 * event's own start, never the advert's feed expiry.
 */
export function registrationWindow(
  row: typeof announcement.$inferSelect,
  now = new Date(),
): { open: boolean; reason: "open" | "disabled" | "closed" | "passed" } {
  if (!row.registrationEnabled) return { open: false, reason: "disabled" }
  if (row.registrationClosesAt && row.registrationClosesAt.getTime() <= now.getTime()) {
    return { open: false, reason: "closed" }
  }
  // Fall back to the event's own start time so a past event stops taking
  // registrations even when no explicit close date was set.
  const start = eventStart(row)
  if (start && start.getTime() <= now.getTime()) return { open: false, reason: "passed" }
  return { open: true, reason: "open" }
}

/** Parses the event's `YYYY-MM-DD` + `HH:MM` columns into a Date. */
export function eventStart(row: typeof announcement.$inferSelect): Date | null {
  if (!row.eventDate) return null
  const time = row.eventTime && /^\d{2}:\d{2}$/.test(row.eventTime) ? row.eventTime : "00:00"
  const parsed = new Date(`${row.eventDate}T${time}:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Finds or creates the contact record for a person within ONE Home.
 *
 * This is what turns three separate form submissions by "Jane Doe" into one
 * recognisable contact with an event history, instead of three anonymous rows.
 *
 * Matching is by normalised email within the Home. The upsert targets the
 * (homeId, emailLower) unique index, so two people registering simultaneously
 * with the same address resolve to the same contact rather than racing to insert
 * duplicates.
 *
 * Home scoping is the privacy boundary: the same email in a different Home is a
 * DIFFERENT contact row. Registering with Home A therefore never makes someone
 * visible to Home B, even when one admin runs both.
 *
 * Must be called inside a transaction so the contact and its registration are
 * committed together.
 */
export async function upsertContact(
  tx: typeof db,
  input: {
    homeId: string
    userId: string | null
    fullName: string
    email: string
    phone: string | null
  },
): Promise<number> {
  const emailLower = normaliseEmail(input.email)
  const phone = normalisePhone(input.phone)

  const [row] = await tx
    .insert(eventContact)
    .values({
      homeId: input.homeId,
      userId: input.userId,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      emailLower,
      phone,
    })
    .onConflictDoUpdate({
      target: [eventContact.homeId, eventContact.emailLower],
      set: {
        // Refresh the name and phone from the latest registration, but never
        // erase details already held with nulls: a returning registrant who
        // omits an optional phone should not wipe the number they gave before.
        fullName: sql`excluded."fullName"`,
        phone: sql`coalesce(excluded."phone", ${eventContact.phone})`,
        // Link the contact to an account the moment we learn of one. An external
        // registrant who later signs up with the same address becomes a
        // recognised account holder without losing their event history.
        userId: sql`coalesce(excluded."userId", ${eventContact.userId})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: eventContact.id })

  return row.id
}

/**
 * Resolves how a viewer relates to a Home + event.
 *
 * Drives the whole "don't ask for what we already know" behaviour: the caller
 * uses `isMember` to decide between one-tap registration and the public form,
 * and `knownName`/`knownEmail`/`knownPhone` to skip fields Frequency can fill
 * in itself.
 */
export async function resolveIdentity(input: {
  homeId: string
  announcementId: number
  userId: string | null
}): Promise<
  EventIdentity & {
    knownName: string | null
    knownEmail: string | null
    knownPhone: string | null
    existingRegistrationId: number | null
  }
> {
  if (!input.userId) {
    return {
      hasAccount: false,
      isMember: false,
      isRegistrant: false,
      knownName: null,
      knownEmail: null,
      knownPhone: null,
      existingRegistrationId: null,
    }
  }

  const [account] = await db
    .select({ name: userTable.name, email: userTable.email, phone: userTable.phone })
    .from(userTable)
    .where(eq(userTable.id, input.userId))
    .limit(1)

  if (!account) {
    return {
      hasAccount: false,
      isMember: false,
      isRegistrant: false,
      knownName: null,
      knownEmail: null,
      knownPhone: null,
      existingRegistrationId: null,
    }
  }

  const [membership] = await db
    .select({ role: homeMembership.role })
    .from(homeMembership)
    .where(
      and(
        eq(homeMembership.homeId, input.homeId),
        eq(homeMembership.userId, input.userId),
        eq(homeMembership.status, "active"),
      ),
    )
    .limit(1)

  // An existing registration is looked up by BOTH the account id and the
  // account's email: someone may have registered as an anonymous non-member
  // first and signed up afterwards, and they should still see "You're
  // registered" rather than being offered a duplicate place.
  const [existing] = await db
    .select({ id: eventRegistration.id })
    .from(eventRegistration)
    .where(
      and(
        eq(eventRegistration.announcementId, input.announcementId),
        eq(eventRegistration.status, "registered"),
        sql`(${eventRegistration.userId} = ${input.userId} or lower(${eventRegistration.email}) = ${normaliseEmail(
          account.email,
        )})`,
      ),
    )
    .limit(1)

  return {
    hasAccount: true,
    isMember: Boolean(membership),
    isRegistrant: Boolean(existing),
    knownName: account.name,
    knownEmail: account.email,
    knownPhone: account.phone ?? null,
    existingRegistrationId: existing?.id ?? null,
  }
}

/**
 * Validates answers against an event's question set.
 *
 * Returns a map of question id → error message. Server-side and authoritative:
 * the client form does its own checking for responsiveness, but a crafted
 * request must not be able to skip a required answer.
 */
export function validateAnswers(
  questions: EventQuestion[],
  answers: RegistrationAnswers,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const q of questions) {
    const value = answers[q.id]
    const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "")

    if (q.required && q.type !== "boolean" && empty) {
      errors[q.id] = "This is required."
      continue
    }
    if (empty) continue

    if ((q.type === "number" || q.type === "guests") && Number.isNaN(Number(value))) {
      errors[q.id] = "Enter a number."
    }
    // A party-size answer feeds the capped `guests` column, so an out-of-range
    // value is rejected here rather than silently clamped — confirming a party
    // of 20 to someone who asked for 60 would be worse than telling them.
    if (q.type === "guests" && !Number.isNaN(Number(value))) {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) errors[q.id] = "Enter 1 or more."
      else if (n > MAX_GUESTS) errors[q.id] = `Up to ${MAX_GUESTS} people per registration.`
    }
    if (q.type === "select" && q.options && !q.options.includes(String(value))) {
      errors[q.id] = "Choose one of the options."
    }
    if (q.type === "short" && String(value).length > 200) {
      errors[q.id] = "Keep this under 200 characters."
    }
    if (q.type === "long" && String(value).length > 2000) {
      errors[q.id] = "Keep this under 2000 characters."
    }
  }
  return errors
}

/**
 * Works out the party size for a registration.
 *
 * Prefers a "guests" question's answer, falling back to an explicit `guests`
 * input and finally to 1. Without this, an admin who adds a "Number of guests"
 * question would see the answer recorded but every registration still counted
 * as a single place — capacity and head-counts would quietly understate the
 * real numbers.
 */
export function resolveGuests(
  questions: EventQuestion[],
  answers: RegistrationAnswers,
  explicit?: number,
): number {
  const q = questions.find((x) => x.type === "guests")
  const raw = q ? answers[q.id] : explicit
  const n = Number(raw ?? 1)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(Math.floor(n), MAX_GUESTS))
}

/**
 * Loads a registerable event together with its Home and organisation.
 *
 * Resolves through the Home's organisation handle so a public URL never exposes
 * an internal id, and returns null (rather than throwing) so callers can render
 * a proper 404 for an event that does not exist, belongs to another Home, or is
 * not a registerable event at all.
 */
export async function loadEventByHandle(
  handle: string,
  announcementId: number,
): Promise<{
  event: typeof announcement.$inferSelect
  homeId: string
  homeName: string
  homeHandle: string
  orgLogo: string | null
  orgId: string
} | null> {
  const [row] = await db
    .select({ ad: announcement, h: home, org: organization })
    .from(announcement)
    .innerJoin(home, eq(home.id, announcement.homeId))
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(
      and(
        eq(announcement.id, announcementId),
        eq(organization.handle, handle),
        eq(announcement.adType, "event"),
        // A soft-deleted Home is treated as non-existent everywhere else in the
        // app; its public event pages must disappear with it.
        sql`${home.deletedAt} is null`,
      ),
    )
    .limit(1)

  if (!row) return null
  return {
    event: row.ad,
    homeId: row.h.id,
    homeName: row.org.name,
    homeHandle: row.org.handle,
    orgLogo: row.org.logo,
    orgId: row.org.id,
  }
}

/**
 * Counts confirmed registrations, for capacity checks and admin display.
 *
 * `total` counts PEOPLE (rows) while `seats` sums party sizes. They differ as
 * soon as an event allows guests, and the distinction matters: the admin list
 * shows people, but capacity has to be enforced against seats or an event with
 * 100 places could admit 100 registrants each bringing a guest.
 */
export async function countRegistrations(
  tx: typeof db,
  announcementId: number,
): Promise<{ total: number; members: number; nonMembers: number; seats: number }> {
  const [row] = await tx
    .select({
      total: sql<number>`count(*)::int`,
      members: sql<number>`count(*) filter (where ${eventRegistration.isMember})::int`,
      nonMembers: sql<number>`count(*) filter (where not ${eventRegistration.isMember})::int`,
      seats: sql<number>`coalesce(sum(${eventRegistration.guests}), 0)::int`,
    })
    .from(eventRegistration)
    .where(and(eq(eventRegistration.announcementId, announcementId), eq(eventRegistration.status, "registered")))
  return {
    total: row?.total ?? 0,
    members: row?.members ?? 0,
    nonMembers: row?.nonMembers ?? 0,
    seats: row?.seats ?? 0,
  }
}
