import "server-only"

import { and, eq, isNotNull, isNull } from "drizzle-orm"

import { db } from "@/lib/db"
import { announcement, eventContact, eventRegistration, homeMembership, user as userTable } from "@/lib/db/schema"

/**
 * Event audiences.
 *
 * NOTE: this is deliberately separate from `app/actions/admin-broadcast.ts`,
 * which is the platform-wide super-admin in-app/push system. This module is
 * Home-scoped and email-only: a church emailing the people who registered for
 * its own event. The two must not be merged — they have different scopes,
 * different permissions and different consent rules.
 */

/** Audiences scoped to a single event. */
const EVENT_SCOPED = ["event_registrants", "event_members", "event_non_members", "event_attended", "event_no_show"] as const

/** Audiences scoped to the whole Home. */
const HOME_SCOPED = ["home_members", "non_member_registrants"] as const

export type AudienceKind = (typeof EVENT_SCOPED)[number] | (typeof HOME_SCOPED)[number]

export type BroadcastPurpose = "event" | "marketing"

export type Recipient = {
  email: string
  name: string | null
  contactId: number | null
}

export function isEventScoped(kind: AudienceKind): boolean {
  return (EVENT_SCOPED as readonly string[]).includes(kind)
}

export const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  event_registrants: "Everyone registered",
  event_members: "Registered members",
  event_non_members: "Registered non-members",
  event_attended: "Attended",
  event_no_show: "Did not attend",
  home_members: "All church members",
  non_member_registrants: "All non-member contacts",
}

export function isAudienceKind(value: string): value is AudienceKind {
  return value in AUDIENCE_LABELS
}

/**
 * Resolves an audience to a de-duplicated recipient list.
 *
 * CONSENT IS ENFORCED HERE, not in the UI, so it cannot be bypassed by calling
 * the action directly:
 *
 * - `purpose: "event"` — a transactional message about an event the person
 *   actually signed up for. Permitted for that event's registrants, but still
 *   suppressed for anyone who used the unsubscribe link
 *   (`eventEmailUnsubscribedAt`).
 * - `purpose: "marketing"` — anything else. Requires an explicit
 *   `marketingOptIn`. A contact with no opt-in, or no contact record at all, is
 *   excluded. Absence of consent is never treated as consent.
 *
 * Every query is filtered by `homeId`, and event-scoped audiences additionally
 * verify the event belongs to that Home, so a caller cannot read another
 * Home's registrants by guessing an event id.
 */
export async function resolveAudience(input: {
  homeId: string
  kind: AudienceKind
  announcementId?: number | null
  purpose: BroadcastPurpose
}): Promise<Recipient[]> {
  const { homeId, kind, purpose } = input

  if (isEventScoped(kind)) {
    const announcementId = input.announcementId
    if (!announcementId) return []

    // Cross-Home guard: the event must belong to this Home.
    const [owned] = await db
      .select({ id: announcement.id })
      .from(announcement)
      .where(and(eq(announcement.id, announcementId), eq(announcement.homeId, homeId)))
      .limit(1)
    if (!owned) return []

    const conditions = [
      eq(eventRegistration.announcementId, announcementId),
      eq(eventRegistration.homeId, homeId),
      // Someone who cancelled should not receive "see you tomorrow".
      eq(eventRegistration.status, "registered"),
    ]

    if (kind === "event_members") conditions.push(eq(eventRegistration.isMember, true))
    if (kind === "event_non_members") conditions.push(eq(eventRegistration.isMember, false))
    if (kind === "event_attended") conditions.push(isNotNull(eventRegistration.attendedAt))
    if (kind === "event_no_show") conditions.push(isNull(eventRegistration.attendedAt))

    // Left join the contact so a registration whose contact row is somehow
    // missing still resolves (email lives on the registration too) rather than
    // silently dropping the person.
    const rows = await db
      .select({
        email: eventRegistration.email,
        name: eventRegistration.fullName,
        contactId: eventRegistration.contactId,
        marketingOptIn: eventContact.marketingOptIn,
        unsubscribedAt: eventContact.eventEmailUnsubscribedAt,
      })
      .from(eventRegistration)
      .leftJoin(eventContact, eq(eventContact.id, eventRegistration.contactId))
      .where(and(...conditions))

    return dedupe(
      rows
        .filter((r) => !r.unsubscribedAt)
        .filter((r) => (purpose === "marketing" ? r.marketingOptIn === true : true))
        .map((r) => ({ email: r.email, name: r.name, contactId: r.contactId })),
    )
  }

  if (kind === "home_members") {
    // Members are addressed through their account email. There is no separate
    // member marketing-consent column, so for a marketing send we require an
    // opted-in contact record matched by userId — no record means no consent.
    const rows = await db
      .select({
        email: userTable.email,
        name: userTable.name,
        contactId: eventContact.id,
        marketingOptIn: eventContact.marketingOptIn,
        unsubscribedAt: eventContact.eventEmailUnsubscribedAt,
      })
      .from(homeMembership)
      .innerJoin(userTable, eq(userTable.id, homeMembership.userId))
      .leftJoin(
        eventContact,
        and(eq(eventContact.userId, homeMembership.userId), eq(eventContact.homeId, homeId)),
      )
      .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.status, "active")))

    return dedupe(
      rows
        .filter((r) => !r.unsubscribedAt)
        .filter((r) => (purpose === "marketing" ? r.marketingOptIn === true : true))
        .map((r) => ({ email: r.email, name: r.name, contactId: r.contactId })),
    )
  }

  // non_member_registrants — Home-wide contacts who are not members of this
  // Home. `userId is null` alone is not enough: a contact can have an account
  // yet still not be a member, and those people belong in this audience.
  const memberUserIds = await db
    .select({ userId: homeMembership.userId })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.status, "active")))
  const memberIdSet = new Set(memberUserIds.map((m) => m.userId))

  const contacts = await db
    .select({
      id: eventContact.id,
      email: eventContact.email,
      name: eventContact.fullName,
      userId: eventContact.userId,
      marketingOptIn: eventContact.marketingOptIn,
      unsubscribedAt: eventContact.eventEmailUnsubscribedAt,
    })
    .from(eventContact)
    .where(eq(eventContact.homeId, homeId))

  return dedupe(
    contacts
      .filter((c) => !c.userId || !memberIdSet.has(c.userId))
      .filter((c) => !c.unsubscribedAt)
      .filter((c) => (purpose === "marketing" ? c.marketingOptIn === true : true))
      .map((c) => ({ email: c.email, name: c.name, contactId: c.id })),
  )
}

/**
 * One message per person. A member who also registered as a contact would
 * otherwise appear twice and receive the same email twice.
 */
function dedupe(recipients: Recipient[]): Recipient[] {
  const seen = new Map<string, Recipient>()
  for (const r of recipients) {
    if (!r.email) continue
    const key = r.email.trim().toLowerCase()
    if (!key) continue
    const existing = seen.get(key)
    // Prefer the entry that carries a name, so the greeting is personalised.
    if (!existing || (!existing.name && r.name)) seen.set(key, r)
  }
  return [...seen.values()]
}

/** Recipient counts for every audience, for the compose screen. */
export async function getAudienceSizes(input: {
  homeId: string
  announcementId?: number | null
  purpose: BroadcastPurpose
}): Promise<{ kind: AudienceKind; label: string; count: number; eventScoped: boolean }[]> {
  const kinds: AudienceKind[] = [...EVENT_SCOPED, ...HOME_SCOPED]
  const sizes = await Promise.all(
    kinds.map(async (kind) => {
      // Event-scoped audiences are meaningless without an event; report them as
      // zero rather than resolving the whole Home by accident.
      if (isEventScoped(kind) && !input.announcementId) {
        return { kind, label: AUDIENCE_LABELS[kind], count: 0, eventScoped: true }
      }
      const recipients = await resolveAudience({
        homeId: input.homeId,
        kind,
        announcementId: input.announcementId ?? null,
        purpose: input.purpose,
      })
      return { kind, label: AUDIENCE_LABELS[kind], count: recipients.length, eventScoped: isEventScoped(kind) }
    }),
  )
  return sizes
}
