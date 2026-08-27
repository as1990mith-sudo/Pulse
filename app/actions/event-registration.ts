"use server"

import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { announcement, eventContact, eventRegistration, homeMembership, user as userTable } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { sendRegistrationConfirmation } from "@/lib/events/email"
import {
  countRegistrations,
  eventStart,
  loadEventByHandle,
  normaliseEmail,
  normalisePhone,
  readConfig,
  registrationWindow,
  resolveGuests,
  resolveIdentity,
  upsertContact,
  validateAnswers,
  type RegistrationAnswers,
} from "@/lib/events/registration"

/**
 * Seats already claimed by one existing registration.
 *
 * Used so someone updating their own booking is measured against the event's
 * remaining capacity net of the place they already hold, rather than being told
 * the event is full by their own seats.
 */
async function seatsHeld(tx: unknown, registrationId: number): Promise<number> {
  const [row] = await (tx as typeof db)
    .select({ guests: eventRegistration.guests, status: eventRegistration.status })
    .from(eventRegistration)
    .where(eq(eventRegistration.id, registrationId))
    .limit(1)
  // A cancelled place holds no seats, so it must not be credited back.
  if (!row || row.status !== "registered") return 0
  return row.guests
}

export type RegisterResult =
  | { ok: true; registrationId: number; alreadyRegistered: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/**
 * Registers a person for an event.
 *
 * ONE action serves both the authenticated member and the anonymous public
 * visitor, because the rules that matter — capacity, the registration window,
 * question validation, one-place-per-person — are identical for both and must
 * not be allowed to drift apart in two copies. What differs is only where the
 * contact details come from:
 *
 *   signed in   name/email are taken from the account and the submitted values
 *               are IGNORED, so a member cannot register under someone else's
 *               identity by editing the form.
 *   anonymous   name/email are taken from the form and validated.
 *
 * Registering never creates a Home membership. A registrant is a contact of the
 * Home, not a member of it — see lib/events/registration.ts.
 */
export async function registerForEvent(input: {
  handle: string
  announcementId: number
  fullName?: string
  email?: string
  phone?: string
  answers?: RegistrationAnswers
  guests?: number
  /** Explicit, separate consent. Never implied by registering. */
  marketingOptIn?: boolean
}): Promise<RegisterResult> {
  const loaded = await loadEventByHandle(input.handle, input.announcementId)
  if (!loaded) return { ok: false, error: "This event no longer exists." }

  const { event, homeId, homeName, homeHandle } = loaded
  const config = readConfig(event)
  if (!config.enabled) return { ok: false, error: "Registration isn't open for this event." }

  const window = registrationWindow(event)
  if (!window.open) {
    return {
      ok: false,
      error:
        window.reason === "closed"
          ? "Registration for this event has closed."
          : window.reason === "passed"
            ? "This event has already taken place."
            : "Registration isn't open for this event.",
    }
  }

  const viewer = await getCurrentUser()
  const viewerId = viewer?.id ?? null

  // A signed-in visitor who is NOT a member can still register through the
  // public page — having an account is not the same as belonging to the Home.
  // But if the event has no public page, only members may register.
  const identity = await resolveIdentity({ homeId, announcementId: input.announcementId, userId: viewerId })
  if (!config.publicPage && !identity.isMember) {
    return { ok: false, error: "This event is open to members of this Home only." }
  }

  // Trust the account over the form for anyone signed in.
  const fullName = (viewerId ? identity.knownName : input.fullName)?.trim() ?? ""
  const email = (viewerId ? identity.knownEmail : input.email)?.trim() ?? ""
  const phone = normalisePhone(input.phone ?? identity.knownPhone)

  if (fullName.length < 2) return { ok: false, error: "Please give your full name." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please give a valid email address." }
  if (config.requiresPhone && !phone) {
    return { ok: false, error: "This event needs a mobile number so the hosts can reach you." }
  }

  const answers = input.answers ?? {}
  const fieldErrors = validateAnswers(config.questions, answers)
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please check your answers.", fieldErrors }
  }

  // Party size comes from a "guests" question when the event has one, so the
  // answer drives capacity and head-counts rather than sitting inert.
  const guests = resolveGuests(config.questions, answers, input.guests)

  let registrationId: number
  let alreadyRegistered = false

  try {
    registrationId = await db.transaction(async (tx) => {
      // Capacity is checked INSIDE the transaction, immediately before the
      // insert, so two people submitting at the same moment cannot both pass a
      // check made outside it and oversell the last place.
      if (config.capacity !== null) {
        const { seats } = await countRegistrations(tx as unknown as typeof db, input.announcementId)
        // Measured in seats, not rows, and includes the party this person is
        // bringing — otherwise a group booking could tip the event over its cap.
        // Re-registering subtracts the place already held so someone editing
        // their own booking is not blocked by their own seats.
        const held = identity.existingRegistrationId ? await seatsHeld(tx, identity.existingRegistrationId) : 0
        if (seats - held + guests > config.capacity) throw new Error("EVENT_FULL")
      }

      const contactId = await upsertContact(tx as unknown as typeof db, {
        homeId,
        userId: viewerId,
        fullName,
        email,
        phone,
      })

      // Marketing consent is only ever granted by an explicit tick, and is
      // never revoked here — withdrawing consent is a separate, deliberate act.
      if (input.marketingOptIn) {
        await tx
          .update(eventContact)
          .set({ marketingOptIn: true, marketingOptInAt: new Date(), updatedAt: new Date() })
          .where(eq(eventContact.id, contactId))
      }

      // Save a member's phone back to their account so no future event ever has
      // to ask again. Only fills a blank — never overwrites a number they set.
      if (viewerId && phone) {
        await tx
          .update(userTable)
          .set({ phone, updatedAt: new Date() })
          .where(and(eq(userTable.id, viewerId), sql`${userTable.phone} is null`))
      }

      // The unique index on (announcementId, contactId) makes this idempotent:
      // a double-tapped button or resubmitted form updates the existing place
      // instead of creating a second one.
      const [row] = await tx
        .insert(eventRegistration)
        .values({
          announcementId: input.announcementId,
          homeId,
          contactId,
          userId: viewerId,
          // Stamped once, never recomputed on read.
          isMember: identity.isMember,
          fullName,
          email,
          phone,
          answers,
          guests,
          status: "registered",
          source: identity.isMember ? "member" : "public",
        })
        .onConflictDoUpdate({
          target: [eventRegistration.announcementId, eventRegistration.contactId],
          set: {
            fullName,
            email,
            phone,
            answers,
            guests,
            // Re-registering after cancelling restores the place.
            status: "registered",
            updatedAt: new Date(),
          },
        })
        .returning({ id: eventRegistration.id, createdAt: eventRegistration.createdAt })

      alreadyRegistered = Boolean(identity.existingRegistrationId)
      return row.id
    })
  } catch (err) {
    if (err instanceof Error && err.message === "EVENT_FULL") {
      return { ok: false, error: "This event is now full." }
    }
    console.log("[v0] Registration failed:", err)
    return { ok: false, error: "Something went wrong. Please try again." }
  }

  // Email is sent AFTER the transaction commits and is fail-soft: the place is
  // already secured, so a provider outage must not turn a successful
  // registration into a reported failure.
  const start = eventStart(event)
  await sendRegistrationConfirmation(email, {
    eventTitle: event.title,
    homeName,
    date: start
      ? start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : null,
    time: event.eventTime ?? null,
    location: event.location ?? null,
    registrantName: fullName,
    confirmationUrl: null,
  })

  revalidatePath(`/events/${homeHandle}/${input.announcementId}`)
  // The listing shows seats taken and a Full/Register chip, so it goes stale the
  // moment a place is booked. Without this it kept advertising "Register" on an
  // event that had just sold out.
  revalidatePath(`/events/${homeHandle}`)
  // The Admin Console's Events section shows live registration counts. Note the
  // path is `/org/<handle>/admin/events` — there is no `/home/<handle>/...`
  // route, so the previous path here silently revalidated nothing.
  revalidatePath(`/org/${homeHandle}/admin/events`)
  revalidatePath("/feed")

  return { ok: true, registrationId, alreadyRegistered }
}

/**
 * Cancels a registration, freeing the place.
 *
 * Soft: the row is kept with status "cancelled" so an admin can still tell
 * "registered then withdrew" from "never registered", and so the audience system
 * can exclude them without losing the history.
 */
export async function cancelRegistration(input: {
  handle: string
  announcementId: number
}): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getCurrentUser()
  if (!viewer) return { ok: false, error: "Please sign in to change your registration." }

  const loaded = await loadEventByHandle(input.handle, input.announcementId)
  if (!loaded) return { ok: false, error: "This event no longer exists." }

  // The account's email is read from the database rather than the session, so
  // the match also covers a place taken anonymously BEFORE this person signed
  // up with the same address.
  const [account] = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, viewer.id))
    .limit(1)

  // Scoped to the viewer's own registration, matched on account id or email, so
  // one person can never cancel another's place.
  await db
    .update(eventRegistration)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(eventRegistration.announcementId, input.announcementId),
        account
          ? sql`(${eventRegistration.userId} = ${viewer.id} or lower(${eventRegistration.email}) = ${normaliseEmail(
              account.email,
            )})`
          : eq(eventRegistration.userId, viewer.id),
      ),
    )

  revalidatePath(`/events/${loaded.homeHandle}/${input.announcementId}`)
  // Cancelling frees a seat, so the listing's Full chip and remaining-places
  // count must be refreshed as well.
  revalidatePath(`/events/${loaded.homeHandle}`)
  revalidatePath(`/org/${loaded.homeHandle}/admin/events`)
  return { ok: true }
}

/**
 * Turns registration on/off for an event and saves its configuration.
 * Admin-only, gated on the publishing Home's manage-events permission.
 */
export async function updateEventRegistrationConfig(input: {
  announcementId: number
  registrationEnabled: boolean
  publicPageEnabled: boolean
  capacity: number | null
  registrationClosesAt: string | null
  requiresPhone: boolean
  questions: { id: string; label: string; type: string; required: boolean; options?: string[] }[]
}): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getCurrentUser()
  if (!viewer) return { ok: false, error: "Please sign in." }

  const [row] = await db
    .select({ homeId: announcement.homeId })
    .from(announcement)
    .where(eq(announcement.id, input.announcementId))
    .limit(1)
  if (!row?.homeId) return { ok: false, error: "This event no longer exists." }

  // Authorisation is checked against the Home that PUBLISHED the event, not the
  // viewer's currently-active Home: an admin of several Homes must not be able
  // to reconfigure Home A's event while Home B happens to be selected.
  const [membership] = await db
    .select({ role: homeMembership.role })
    .from(homeMembership)
    .where(
      and(
        eq(homeMembership.homeId, row.homeId),
        eq(homeMembership.userId, viewer.id),
        eq(homeMembership.status, "active"),
      ),
    )
    .limit(1)
  if (!membership || !["owner", "administrator", "moderator"].includes(membership.role)) {
    return { ok: false, error: "You don't have permission to manage this event." }
  }

  const closesAt = input.registrationClosesAt ? new Date(input.registrationClosesAt) : null

  await db
    .update(announcement)
    .set({
      registrationEnabled: input.registrationEnabled,
      publicPageEnabled: input.publicPageEnabled,
      capacity: input.capacity && input.capacity > 0 ? input.capacity : null,
      registrationClosesAt: closesAt && !Number.isNaN(closesAt.getTime()) ? closesAt : null,
      requiresPhone: input.requiresPhone,
      questions: input.questions,
    })
    .where(eq(announcement.id, input.announcementId))

  revalidatePath("/feed")
  return { ok: true }
}

/** Marks a registrant present/absent at the event. Admin-only. */
export async function setAttendance(input: {
  registrationId: number
  attended: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getCurrentUser()
  if (!viewer) return { ok: false, error: "Please sign in." }

  const [reg] = await db
    .select({ homeId: eventRegistration.homeId })
    .from(eventRegistration)
    .where(eq(eventRegistration.id, input.registrationId))
    .limit(1)
  if (!reg) return { ok: false, error: "Registration not found." }

  const [membership] = await db
    .select({ role: homeMembership.role })
    .from(homeMembership)
    .where(
      and(
        eq(homeMembership.homeId, reg.homeId),
        eq(homeMembership.userId, viewer.id),
        eq(homeMembership.status, "active"),
      ),
    )
    .limit(1)
  if (!membership || !["owner", "administrator", "moderator"].includes(membership.role)) {
    return { ok: false, error: "You don't have permission." }
  }

  await db
    .update(eventRegistration)
    .set({ attendedAt: input.attended ? new Date() : null, updatedAt: new Date() })
    .where(eq(eventRegistration.id, input.registrationId))

  return { ok: true }
}
