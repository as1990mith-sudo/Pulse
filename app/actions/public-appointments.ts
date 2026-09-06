"use server"

import "server-only"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { home, homeAppointment, homeAppointmentType, organization } from "@/lib/db/schema"
import { getHomeByHandle } from "@/lib/home/access"
import { isStripeConfigured, stripe } from "@/lib/stripe"
import {
  assertSlotBookable,
  computeOpenSlots,
  deriveDisplayStatus,
  listBookableTypesForHome,
  meetingWindowFor,
  mintAppointmentToken,
  newManageToken,
  resolveHostForType,
  type OpenSlot,
  type PublicTypeRow,
} from "@/lib/appointments/core"
import { notifyAppointment } from "@/lib/appointments/notify"
import { confirmAppointmentPaid } from "@/app/actions/home-appointments"

/* -------------------------------------------------------------------------- */
/* Public Home + types (booking page)                                         */
/* -------------------------------------------------------------------------- */

export type PublicBookingHome = {
  handle: string
  homeId: string
  name: string
  tagline: string | null
  avatarUrl: string | null
}

/** Resolves the public booking context for a Home handle, or null if unknown. */
export async function getPublicBookingHome(handle: string): Promise<PublicBookingHome | null> {
  const h = await getHomeByHandle(handle)
  if (!h) return null
  return {
    handle,
    homeId: h.id,
    name: h.orgName || h.name,
    tagline: h.orgDescription ?? null,
    avatarUrl: h.orgLogo ?? null,
  }
}

/** Bookable types for the public page. */
export async function getPublicBookableTypes(homeId: string): Promise<PublicTypeRow[]> {
  return listBookableTypesForHome(homeId)
}

/** Open slots for a type, resolved from the handle (no auth). */
export async function getPublicOpenSlots(handle: string, typeId: string): Promise<OpenSlot[]> {
  const h = await getHomeByHandle(handle)
  if (!h) throw new Error("This page isn't available.")
  const [type] = await db
    .select()
    .from(homeAppointmentType)
    .where(eq(homeAppointmentType.id, typeId))
    .limit(1)
  if (!type || type.homeId !== h.id || !type.active) throw new Error("Appointment type not found.")
  return computeOpenSlots(h.id, type)
}

/* -------------------------------------------------------------------------- */
/* Guest booking                                                              */
/* -------------------------------------------------------------------------- */

export type GuestBookInput = {
  handle: string
  typeId: string
  slotStartISO: string
  guestName: string
  guestEmail: string
  guestPhone: string
}

export type GuestBookResult =
  | { kind: "confirmed"; manageToken: string }
  | { kind: "payment"; appointmentId: string; manageToken: string; clientSecret: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Books a slot for a GUEST (no Frequency account). Collects name/email/phone,
 * reuses the exact same slot + double-booking guard as the member flow, and
 * returns a manage token. Free types confirm instantly and email immediately;
 * paid types return a Stripe client secret and are confirmed + emailed once the
 * payment is reconciled (shared confirmAppointmentPaid). Guests never get a DM
 * conversation — the tokenised manage page is their thread.
 */
export async function bookGuestAppointment(input: GuestBookInput): Promise<GuestBookResult> {
  const name = input.guestName.trim()
  const email = input.guestEmail.trim()
  const phone = input.guestPhone.trim()
  if (name.length < 2) throw new Error("Please enter your full name.")
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email address.")
  if (phone.replace(/[^0-9]/g, "").length < 6) throw new Error("Please enter a valid phone number.")

  const h = await getHomeByHandle(input.handle)
  if (!h) throw new Error("This page isn't available.")

  const [type] = await db
    .select()
    .from(homeAppointmentType)
    .where(eq(homeAppointmentType.id, input.typeId))
    .limit(1)
  if (!type || type.homeId !== h.id || !type.active) throw new Error("Appointment type not found.")

  const host = await resolveHostForType(h.id, type)
  if (!host) throw new Error("This appointment type has no host configured.")

  const start = new Date(input.slotStartISO)
  await assertSlotBookable({ homeId: h.id, type, hostUserId: host.hostUserId, start })

  const endsAt = new Date(start.getTime() + type.durationMinutes * 60_000)
  const appointmentId = crypto.randomUUID()
  const manageToken = newManageToken()
  const isPaid = type.priceCents != null && type.priceCents > 0

  await db.insert(homeAppointment).values({
    id: appointmentId,
    homeId: h.id,
    memberUserId: null, // guest — no account
    memberName: name,
    guestName: name,
    guestEmail: email,
    guestPhone: phone,
    hostUserId: host.hostUserId,
    hostName: host.hostName,
    title: type.title,
    notes: type.description ?? null,
    location: type.useFrequencyLive ? null : type.location,
    startsAt: start,
    endsAt,
    durationMinutes: type.durationMinutes,
    typeId: type.id,
    useFrequencyLive: type.useFrequencyLive,
    status: isPaid ? "pending_payment" : "upcoming",
    paymentStatus: isPaid ? "pending" : "not_required",
    priceCents: type.priceCents ?? null,
    currency: type.currency,
    manageToken,
  })

  if (!isPaid) {
    await notifyAppointment(appointmentId, "confirmed") // only after commit
    return { kind: "confirmed", manageToken }
  }

  if (!isStripeConfigured()) throw new Error("Payments are not configured for this appointment.")
  const session = await stripe.checkout.sessions.create(
    {
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: type.currency,
            product_data: { name: type.title, description: `Appointment · ${type.durationMinutes} min` },
            unit_amount: type.priceCents as number,
          },
          quantity: 1,
        },
      ],
      metadata: { appointmentId, homeId: h.id, kind: "home_appointment" },
    },
    { idempotencyKey: `appt_${appointmentId}` },
  )

  await db
    .update(homeAppointment)
    .set({ stripeSessionId: session.id, updatedAt: new Date() })
    .where(eq(homeAppointment.id, appointmentId))

  return { kind: "payment", appointmentId, manageToken, clientSecret: session.client_secret as string }
}

/** Guests reconcile their paid booking via the shared, Stripe-verified path. */
export async function confirmGuestAppointmentPaid(appointmentId: string): Promise<void> {
  await confirmAppointmentPaid(appointmentId)
}

/* -------------------------------------------------------------------------- */
/* Token-based manage (cancel / reschedule / join) — no account needed        */
/* -------------------------------------------------------------------------- */

export type ManageView = {
  manageToken: string
  title: string
  homeName: string
  homeHandle: string
  hostName: string | null
  bookerName: string
  startISO: string
  endISO: string
  durationMinutes: number
  useFrequencyLive: boolean
  location: string | null
  status: string
  meetingWindow: "early" | "open" | "closed"
  opensAtISO: string
}

/** Loads an appointment by its manage token, or null if the token is unknown. */
export async function getAppointmentByToken(token: string): Promise<ManageView | null> {
  if (!token) return null
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.manageToken, token)).limit(1)
  if (!a) return null

  const [org] = await db
    .select({ name: organization.name, handle: organization.handle })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(eq(home.id, a.homeId))
    .limit(1)

  const win = meetingWindowFor(a)
  return {
    manageToken: token,
    title: a.title,
    homeName: org?.name ?? "Home",
    homeHandle: org?.handle ?? "",
    hostName: a.hostName,
    bookerName: a.guestName ?? a.memberName,
    startISO: a.startsAt.toISOString(),
    endISO: (a.endsAt ?? new Date(a.startsAt.getTime() + a.durationMinutes * 60_000)).toISOString(),
    durationMinutes: a.durationMinutes,
    useFrequencyLive: a.useFrequencyLive,
    location: a.location,
    status: deriveDisplayStatus(a),
    meetingWindow: win.window,
    opensAtISO: new Date(win.opensAt).toISOString(),
  }
}

/**
 * Cancels via manage token. Flips status to "cancelled" (immediately freeing the
 * slot — the slot engine only counts live rows as taken) and emails the booker.
 */
export async function cancelAppointmentByToken(token: string): Promise<void> {
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.manageToken, token)).limit(1)
  if (!a) throw new Error("Appointment not found.")
  if (a.status === "cancelled") return
  if ((a.endsAt ?? a.startsAt).getTime() < Date.now()) throw new Error("This appointment has already passed.")

  await db
    .update(homeAppointment)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(homeAppointment.id, a.id))

  await notifyAppointment(a.id, "cancelled")
  revalidatePath("/appointments")
}

/** Open slots for rescheduling an appointment identified by its manage token. */
export async function getRescheduleSlotsByToken(token: string): Promise<OpenSlot[]> {
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.manageToken, token)).limit(1)
  if (!a || !a.typeId) return []
  const [type] = await db.select().from(homeAppointmentType).where(eq(homeAppointmentType.id, a.typeId)).limit(1)
  if (!type) return []
  return computeOpenSlots(a.homeId, type)
}

/**
 * Reschedules via manage token. The move is a single guarded UPDATE: the new
 * slot is validated + reserved and the old time freed atomically, so it is never
 * released before the new one is confirmed and two people can't collide. Emails
 * the booker the updated details.
 */
export async function rescheduleAppointmentByToken(token: string, slotStartISO: string): Promise<void> {
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.manageToken, token)).limit(1)
  if (!a) throw new Error("Appointment not found.")
  if (a.status === "cancelled") throw new Error("This appointment was cancelled.")
  if (!a.typeId) throw new Error("This appointment can't be rescheduled.")
  if (!a.hostUserId) throw new Error("This appointment has no host.")

  const [type] = await db.select().from(homeAppointmentType).where(eq(homeAppointmentType.id, a.typeId)).limit(1)
  if (!type) throw new Error("Appointment type not found.")

  const start = new Date(slotStartISO)
  await assertSlotBookable({
    homeId: a.homeId,
    type,
    hostUserId: a.hostUserId,
    start,
    excludeAppointmentId: a.id,
  })
  const endsAt = new Date(start.getTime() + a.durationMinutes * 60_000)

  await db
    .update(homeAppointment)
    .set({ startsAt: start, endsAt, updatedAt: new Date() })
    .where(eq(homeAppointment.id, a.id))

  await notifyAppointment(a.id, "rescheduled")
  revalidatePath("/appointments")
}

/* -------------------------------------------------------------------------- */
/* Guest meeting token                                                        */
/* -------------------------------------------------------------------------- */

export type GuestMeetingToken = { url: string; token: string; roomName: string }

/**
 * Mints a LiveKit token for a GUEST to join their appointment room, gated by the
 * manage token and the meeting time window. Records guest attendance the first
 * time. Guests join as a non-host participant of the same `appt-<id>` room.
 */
export async function getGuestMeetingToken(token: string): Promise<GuestMeetingToken> {
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.manageToken, token)).limit(1)
  if (!a) throw new Error("Appointment not found.")
  if (a.status === "cancelled") throw new Error("This appointment was cancelled.")
  if (!a.useFrequencyLive) throw new Error("This appointment is not a video call.")

  const { window } = meetingWindowFor(a)
  if (window === "early") throw new Error("The meeting hasn't opened yet.")
  if (window === "closed") throw new Error("The meeting has ended.")

  if (!a.memberAttendedAt) {
    const now = new Date()
    await db
      .update(homeAppointment)
      .set({ memberAttendedAt: now, updatedAt: now })
      .where(eq(homeAppointment.id, a.id))
  }

  return mintAppointmentToken({
    appointmentId: a.id,
    identity: `guest-${a.id}`,
    name: a.guestName ?? a.memberName ?? "Guest",
    image: null,
    isHost: false,
  })
}
