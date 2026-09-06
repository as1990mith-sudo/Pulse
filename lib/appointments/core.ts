import "server-only"

import { and, eq, inArray, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { homeAppointment, homeAppointmentAvailability, homeAppointmentType } from "@/lib/db/schema"
import { createAccessToken, LIVEKIT_URL } from "@/lib/livekit"

/**
 * Shared, auth-free appointment logic used by BOTH the member actions
 * (app/actions/home-appointments.ts) and the public guest actions
 * (app/actions/public-appointments.ts). Kept in a plain module because a
 * "use server" file may only export async action functions — the slot engine,
 * conflict guard, meeting-window math and status derivation must live here so
 * the two entry points can never drift apart.
 */

export const SLOT_HORIZON_DAYS = 21
export const MEETING_EARLY_MS = 10 * 60_000 // join opens 10 min before start
export const MEETING_GRACE_MS = 15 * 60_000 // room stays joinable 15 min past end

export type OpenSlot = { startISO: string; endISO: string }

export type AppointmentTypeRecord = typeof homeAppointmentType.$inferSelect

/**
 * An unguessable, URL-safe token that lets a booker (guest OR member) open their
 * appointment manage page — join, reschedule, cancel — without signing in.
 * ~192 bits of entropy.
 */
export function newManageToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "")
}

/* -------------------------------------------------------------------------- */
/* Slots                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Open slots for a type over the next few weeks. Availability weekdays/minutes
 * are interpreted in UTC for determinism; each window is chunked into the type's
 * duration, past slots are dropped, and slots already held by a live appointment
 * of the same host are excluded. No auth — callers gate access.
 */
export async function computeOpenSlots(homeId: string, type: AppointmentTypeRecord): Promise<OpenSlot[]> {
  const windows = await db
    .select()
    .from(homeAppointmentAvailability)
    .where(eq(homeAppointmentAvailability.typeId, type.id))
  if (windows.length === 0) return []

  const duration = type.durationMinutes
  const now = Date.now()

  const taken = await db
    .select({ startsAt: homeAppointment.startsAt })
    .from(homeAppointment)
    .where(
      and(
        eq(homeAppointment.homeId, homeId),
        type.hostUserId ? eq(homeAppointment.hostUserId, type.hostUserId) : eq(homeAppointment.typeId, type.id),
        inArray(homeAppointment.status, ["upcoming", "pending_payment"]),
      ),
    )
  const takenSet = new Set(taken.map((t) => t.startsAt.getTime()))

  const slots: OpenSlot[] = []
  const today = new Date()
  const baseUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  for (let dayOffset = 0; dayOffset < SLOT_HORIZON_DAYS; dayOffset++) {
    const dayStart = baseUTC + dayOffset * 86_400_000
    const weekday = new Date(dayStart).getUTCDay()
    for (const w of windows) {
      if (w.weekday !== weekday) continue
      for (let m = w.startMinute; m + duration <= w.endMinute; m += duration) {
        const start = dayStart + m * 60_000
        if (start <= now) continue
        if (takenSet.has(start)) continue
        slots.push({
          startISO: new Date(start).toISOString(),
          endISO: new Date(start + duration * 60_000).toISOString(),
        })
      }
    }
  }
  slots.sort((a, b) => a.startISO.localeCompare(b.startISO))
  return slots
}

/**
 * Validates that `start` is a real availability boundary for `type` AND that no
 * other live appointment of the same host already holds it. Throws with a
 * user-facing message on failure. `excludeAppointmentId` lets a reschedule
 * ignore its own row. This is the single guard against double-booking; every
 * write path (member book, guest book, reschedule) must call it.
 */
export async function assertSlotBookable(opts: {
  homeId: string
  type: AppointmentTypeRecord
  hostUserId: string
  start: Date
  excludeAppointmentId?: string
}): Promise<void> {
  const { homeId, type, hostUserId, start, excludeAppointmentId } = opts

  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    throw new Error("That time is no longer available.")
  }

  const windows = await db
    .select()
    .from(homeAppointmentAvailability)
    .where(eq(homeAppointmentAvailability.typeId, type.id))
  const dayStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const minuteOfDay = Math.round((start.getTime() - dayStart) / 60_000)
  const weekday = start.getUTCDay()
  const fits = windows.some(
    (w) =>
      w.weekday === weekday &&
      minuteOfDay >= w.startMinute &&
      minuteOfDay + type.durationMinutes <= w.endMinute &&
      (minuteOfDay - w.startMinute) % type.durationMinutes === 0,
  )
  if (!fits) throw new Error("That time is not a valid slot.")

  const conflict = await db
    .select({ id: homeAppointment.id })
    .from(homeAppointment)
    .where(
      and(
        eq(homeAppointment.homeId, homeId),
        eq(homeAppointment.hostUserId, hostUserId),
        eq(homeAppointment.startsAt, start),
        inArray(homeAppointment.status, ["upcoming", "pending_payment"]),
        ...(excludeAppointmentId ? [ne(homeAppointment.id, excludeAppointmentId)] : []),
      ),
    )
    .limit(1)
  if (conflict.length > 0) throw new Error("That time was just taken. Please pick another.")
}

export type PublicTypeRow = {
  id: string
  title: string
  description: string | null
  durationMinutes: number
  priceCents: number | null
  currency: string
  useFrequencyLive: boolean
  location: string | null
}

/**
 * Active bookable types for a Home that actually have availability — the list
 * shown on the public booking page. No auth; only surfaces bookable types.
 */
export async function listBookableTypesForHome(homeId: string): Promise<PublicTypeRow[]> {
  const types = await db
    .select()
    .from(homeAppointmentType)
    .where(and(eq(homeAppointmentType.homeId, homeId), eq(homeAppointmentType.active, true)))
  if (types.length === 0) return []

  const windows = await db
    .select({ typeId: homeAppointmentAvailability.typeId })
    .from(homeAppointmentAvailability)
    .where(
      inArray(
        homeAppointmentAvailability.typeId,
        types.map((t) => t.id),
      ),
    )
  const hasWindows = new Set(windows.map((w) => w.typeId))

  return types
    .filter((t) => hasWindows.has(t.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      durationMinutes: t.durationMinutes,
      priceCents: t.priceCents,
      currency: t.currency,
      useFrequencyLive: t.useFrequencyLive,
      location: t.location,
    }))
}

/* -------------------------------------------------------------------------- */
/* Meeting window + token                                                     */
/* -------------------------------------------------------------------------- */

export type MeetingWindow = "early" | "open" | "closed"

export function meetingBounds(startsAt: Date, endsAt: Date | null, duration: number) {
  const end = endsAt ?? new Date(startsAt.getTime() + duration * 60_000)
  return {
    opensAt: startsAt.getTime() - MEETING_EARLY_MS,
    closesAt: end.getTime() + MEETING_GRACE_MS,
  }
}

export function meetingWindowFor(
  a: { startsAt: Date; endsAt: Date | null; durationMinutes: number },
  now: number = Date.now(),
): { window: MeetingWindow; opensAt: number; closesAt: number } {
  const { opensAt, closesAt } = meetingBounds(a.startsAt, a.endsAt, a.durationMinutes)
  const window: MeetingWindow = now < opensAt ? "early" : now > closesAt ? "closed" : "open"
  return { window, opensAt, closesAt }
}

/** Mints a LiveKit token for an appointment's private room `appt-<id>`. */
export async function mintAppointmentToken(opts: {
  appointmentId: string
  identity: string
  name: string
  image?: string | null
  isHost: boolean
}): Promise<{ url: string; token: string; roomName: string }> {
  const roomName = `appt-${opts.appointmentId}`
  const token = await createAccessToken({
    roomName,
    identity: opts.identity,
    name: opts.name,
    canPublish: true, // both participants are equals in a 1:1 meeting
    metadata: JSON.stringify({ image: opts.image ?? null, isHost: opts.isHost }),
  })
  return { url: LIVEKIT_URL, token, roomName }
}

/* -------------------------------------------------------------------------- */
/* Status derivation                                                          */
/* -------------------------------------------------------------------------- */

export type DisplayStatus =
  | "upcoming"
  | "in_progress"
  | "completed"
  | "no_show"
  | "cancelled"
  | "pending_payment"

/**
 * Resolve the lifecycle state a user should see. The stored `status` column only
 * captures manual/explicit states (cancelled, pending payment, host-completed);
 * everything time-based is computed here so an appointment never gets stuck on
 * "Upcoming". Once the meeting window closes, a Frequency Live session resolves
 * to "completed" when BOTH parties joined and "no_show" otherwise. In-person
 * sessions (no join signal) are treated as completed once their time has passed.
 */
export function deriveDisplayStatus(
  a: {
    status: string
    paymentStatus: string
    startsAt: Date
    endsAt: Date | null
    durationMinutes: number
    useFrequencyLive: boolean
    memberAttendedAt: Date | null
    hostAttendedAt: Date | null
  },
  now: number = Date.now(),
): DisplayStatus {
  if (a.status === "cancelled") return "cancelled"
  if (a.status === "pending_payment" || a.paymentStatus === "pending") return "pending_payment"
  if (a.status === "completed") return "completed"

  const { closesAt } = meetingBounds(a.startsAt, a.endsAt, a.durationMinutes)
  const start = a.startsAt.getTime()

  if (now < start) return "upcoming"
  if (now <= closesAt) return "in_progress"

  if (a.useFrequencyLive) {
    return a.memberAttendedAt && a.hostAttendedAt ? "completed" : "no_show"
  }
  return "completed"
}
