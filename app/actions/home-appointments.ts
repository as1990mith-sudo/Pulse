"use server"

import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  dmConversation,
  dmMessage,
  home,
  homeAppointment,
  homeAppointmentAvailability,
  homeAppointmentType,
  homeMembership,
  organization,
  user as userTable,
} from "@/lib/db/schema"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { homeRoleHasPermission } from "@/lib/home/roles"
import { createAccessToken, isLiveKitConfigured, LIVEKIT_URL } from "@/lib/livekit"
import { stripe, isStripeConfigured } from "@/lib/stripe"

/* -------------------------------------------------------------------------- */
/* Auth / scoping helpers                                                     */
/* -------------------------------------------------------------------------- */

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/**
 * Asserts the caller manages appointments in THIS Home and returns the home id.
 * Scoped to one organisation — a manager of Home A can never touch Home B's
 * appointment types or bookings. Never derive the Home/role from the account.
 */
async function requireApptManager(handle: string) {
  const user = await requireUser()
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, "appointments.manage")) {
    throw new Error("You don't have permission to do that.")
  }
  return { user, home, homeId: home.id, handle }
}

/** Asserts the caller is an active member of the Home and returns the home. */
async function requireActiveMember(handle: string) {
  const user = await requireUser()
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active") {
    throw new Error("You must be a member of this Home to do that.")
  }
  return { user, home, homeId: home.id, membership }
}

/** The Home owner's user id — the default host when a type has none assigned. */
async function resolveHomeOwnerId(homeId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: homeMembership.userId })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.role, "owner")))
    .limit(1)
  return row?.userId ?? null
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type AvailabilityWindow = {
  weekday: number // 0 (Sun) .. 6 (Sat)
  startMinute: number
  endMinute: number
}

export type AppointmentTypeRow = {
  id: string
  title: string
  description: string | null
  durationMinutes: number
  priceCents: number | null
  currency: string
  useFrequencyLive: boolean
  location: string | null
  active: boolean
  hostUserId: string | null
  hostName: string | null
  windows: AvailabilityWindow[]
}

export type OpenSlot = {
  startISO: string
  endISO: string
}

export type PaymentStatus = "not_required" | "pending" | "paid" | "refunded"

export type MyAppointmentRow = {
  id: string
  title: string
  homeHandle: string
  homeName: string
  hostName: string | null
  startsAt: string
  endsAt: string | null
  durationMinutes: number
  status: string
  paymentStatus: PaymentStatus
  priceCents: number | null
  currency: string
  useFrequencyLive: boolean
  location: string | null
  conversationId: number | null
}

export type AdminAppointmentDetail = MyAppointmentRow & {
  memberName: string
  notes: string | null
}

/** The status shown to users — derived, never a raw column read. */
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
function deriveDisplayStatus(
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
  if (a.status === "completed") return "completed" // host marked it done explicitly

  const { closesAt } = meetingBounds(a.startsAt, a.endsAt, a.durationMinutes)
  const start = a.startsAt.getTime()

  if (now < start) return "upcoming"
  if (now <= closesAt) return "in_progress" // live window (10 min early → 15 min grace)

  // Window has closed with no explicit completion.
  if (a.useFrequencyLive) {
    return a.memberAttendedAt && a.hostAttendedAt ? "completed" : "no_show"
  }
  return "completed"
}

/* -------------------------------------------------------------------------- */
/* Admin: appointment types + availability                                    */
/* -------------------------------------------------------------------------- */

export async function listAppointmentTypes(handle: string): Promise<AppointmentTypeRow[]> {
  const { homeId } = await requireApptManager(handle)
  return loadTypeRows(homeId)
}

async function loadTypeRows(homeId: string, onlyActive = false): Promise<AppointmentTypeRow[]> {
  const typeWhere = onlyActive
    ? and(eq(homeAppointmentType.homeId, homeId), eq(homeAppointmentType.active, true))
    : eq(homeAppointmentType.homeId, homeId)

  const types = await db
    .select()
    .from(homeAppointmentType)
    .where(typeWhere)
    .orderBy(desc(homeAppointmentType.createdAt))
  if (types.length === 0) return []

  const windows = await db
    .select()
    .from(homeAppointmentAvailability)
    .where(
      inArray(
        homeAppointmentAvailability.typeId,
        types.map((t) => t.id),
      ),
    )

  const byType = new Map<string, AvailabilityWindow[]>()
  for (const w of windows) {
    const arr = byType.get(w.typeId) ?? []
    arr.push({ weekday: w.weekday, startMinute: w.startMinute, endMinute: w.endMinute })
    byType.set(w.typeId, arr)
  }

  return types.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    durationMinutes: t.durationMinutes,
    priceCents: t.priceCents,
    currency: t.currency,
    useFrequencyLive: t.useFrequencyLive,
    location: t.location,
    active: t.active,
    hostUserId: t.hostUserId,
    hostName: t.hostName,
    windows: (byType.get(t.id) ?? []).sort((a, b) =>
      a.weekday === b.weekday ? a.startMinute - b.startMinute : a.weekday - b.weekday,
    ),
  }))
}

export async function createAppointmentType(input: {
  handle: string
  title: string
  description?: string
  durationMinutes: number
  priceCents?: number | null
  useFrequencyLive: boolean
  location?: string | null
  hostUserId?: string | null
}): Promise<{ id: string }> {
  const { user, homeId } = await requireApptManager(input.handle)
  const title = input.title.trim()
  if (!title) throw new Error("A title is required.")
  const duration = Math.round(input.durationMinutes)
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    throw new Error("Duration must be between 5 and 480 minutes.")
  }
  // Price is trusted only from the server side; clamp and validate.
  let priceCents: number | null = null
  if (input.priceCents != null && input.priceCents > 0) {
    priceCents = Math.round(input.priceCents)
    if (priceCents < 50) throw new Error("Paid appointments must be at least 0.50.")
    if (priceCents > 5_000_00) throw new Error("Price is too high.")
  }

  // Resolve the host server-side. Default to the acting admin so a type always
  // has a real person to run the 1:1 conversation + meeting.
  let hostUserId = input.hostUserId ?? user.id
  // The host must be an active member/admin of THIS Home.
  const [hostMembership] = await db
    .select({ userId: homeMembership.userId })
    .from(homeMembership)
    .where(
      and(
        eq(homeMembership.homeId, homeId),
        eq(homeMembership.userId, hostUserId),
        eq(homeMembership.status, "active"),
      ),
    )
    .limit(1)
  if (!hostMembership) hostUserId = user.id
  const [hostUser] = await db.select().from(userTable).where(eq(userTable.id, hostUserId)).limit(1)

  const id = crypto.randomUUID()
  await db.insert(homeAppointmentType).values({
    id,
    homeId,
    hostUserId,
    hostName: hostUser?.name ?? "Host",
    title,
    description: input.description?.trim() || null,
    durationMinutes: duration,
    priceCents,
    currency: "usd",
    useFrequencyLive: input.useFrequencyLive,
    location: input.useFrequencyLive ? null : input.location?.trim() || null,
    active: true,
  })
  revalidatePath(`/org/${input.handle}/admin/appointments`)
  return { id }
}

export async function updateAppointmentType(input: {
  handle: string
  id: string
  patch: Partial<{
    title: string
    description: string | null
    durationMinutes: number
    priceCents: number | null
    useFrequencyLive: boolean
    location: string | null
    active: boolean
  }>
}) {
  const { homeId } = await requireApptManager(input.handle)
  const set: Record<string, unknown> = { updatedAt: new Date() }
  const p = input.patch
  if (p.title !== undefined) {
    const t = p.title.trim()
    if (!t) throw new Error("A title is required.")
    set.title = t
  }
  if (p.description !== undefined) set.description = p.description?.trim() || null
  if (p.durationMinutes !== undefined) {
    const d = Math.round(p.durationMinutes)
    if (!Number.isFinite(d) || d < 5 || d > 480) throw new Error("Invalid duration.")
    set.durationMinutes = d
  }
  if (p.priceCents !== undefined) {
    if (p.priceCents == null || p.priceCents <= 0) set.priceCents = null
    else {
      const c = Math.round(p.priceCents)
      if (c < 50 || c > 5_000_00) throw new Error("Invalid price.")
      set.priceCents = c
    }
  }
  if (p.useFrequencyLive !== undefined) set.useFrequencyLive = p.useFrequencyLive
  if (p.location !== undefined) set.location = p.location?.trim() || null
  if (p.active !== undefined) set.active = p.active

  await db
    .update(homeAppointmentType)
    .set(set)
    .where(and(eq(homeAppointmentType.id, input.id), eq(homeAppointmentType.homeId, homeId)))
  revalidatePath(`/org/${input.handle}/admin/appointments`)
}

export async function setAvailability(input: { handle: string; typeId: string; windows: AvailabilityWindow[] }) {
  const { homeId } = await requireApptManager(input.handle)
  // Confirm the type belongs to this Home before touching its windows.
  const [type] = await db
    .select({ id: homeAppointmentType.id })
    .from(homeAppointmentType)
    .where(and(eq(homeAppointmentType.id, input.typeId), eq(homeAppointmentType.homeId, homeId)))
    .limit(1)
  if (!type) throw new Error("Appointment type not found.")

  const clean = input.windows
    .map((w) => ({
      weekday: Math.max(0, Math.min(6, Math.round(w.weekday))),
      startMinute: Math.max(0, Math.min(1439, Math.round(w.startMinute))),
      endMinute: Math.max(1, Math.min(1440, Math.round(w.endMinute))),
    }))
    .filter((w) => w.endMinute > w.startMinute)

  await db.transaction(async (tx) => {
    await tx.delete(homeAppointmentAvailability).where(eq(homeAppointmentAvailability.typeId, input.typeId))
    if (clean.length > 0) {
      await tx.insert(homeAppointmentAvailability).values(
        clean.map((w) => ({
          id: crypto.randomUUID(),
          typeId: input.typeId,
          homeId,
          weekday: w.weekday,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        })),
      )
    }
  })
  revalidatePath(`/org/${input.handle}/admin/appointments`)
}

/** Every booking in this Home (manager view), newest first, with conversation ids. */
export async function listHomeBookings(handle: string): Promise<AdminAppointmentDetail[]> {
  const { homeId, home } = await requireApptManager(handle)
  const rows = await db
    .select()
    .from(homeAppointment)
    .where(eq(homeAppointment.homeId, homeId))
    .orderBy(desc(homeAppointment.startsAt))
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    homeHandle: handle,
    homeName: home.orgName,
    hostName: a.hostName,
    memberName: a.memberName,
    notes: a.notes,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    durationMinutes: a.durationMinutes,
    status: deriveDisplayStatus(a),
    paymentStatus: a.paymentStatus as PaymentStatus,
    priceCents: a.priceCents,
    currency: a.currency,
    useFrequencyLive: a.useFrequencyLive,
    location: a.location,
    conversationId: a.conversationId,
  }))
}

/** Full admin detail for a single booking, with the linked conversation id. */
export async function getAdminBookingDetail(handle: string, appointmentId: string): Promise<AdminAppointmentDetail> {
  const { homeId, home } = await requireApptManager(handle)
  const [a] = await db
    .select()
    .from(homeAppointment)
    .where(and(eq(homeAppointment.id, appointmentId), eq(homeAppointment.homeId, homeId)))
    .limit(1)
  if (!a) throw new Error("Appointment not found.")
  return {
    id: a.id,
    title: a.title,
    homeHandle: handle,
    homeName: home.orgName,
    hostName: a.hostName,
    memberName: a.memberName,
    notes: a.notes,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    durationMinutes: a.durationMinutes,
    status: deriveDisplayStatus(a),
    paymentStatus: a.paymentStatus as PaymentStatus,
    priceCents: a.priceCents,
    currency: a.currency,
    useFrequencyLive: a.useFrequencyLive,
    location: a.location,
    conversationId: a.conversationId,
  }
}

/* -------------------------------------------------------------------------- */
/* Member: browse + book                                                      */
/* -------------------------------------------------------------------------- */

export async function listBookableTypes(handle: string): Promise<AppointmentTypeRow[]> {
  await requireActiveMember(handle)
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const rows = await loadTypeRows(home.id, true)
  // Only surface types that actually have availability to book.
  return rows.filter((t) => t.windows.length > 0)
}

const SLOT_HORIZON_DAYS = 21

/**
 * Computes open slots for a type over the next few weeks. Availability weekdays
 * and minutes are interpreted in UTC for determinism; each window is chunked
 * into the type's duration, past slots are dropped, and slots already taken by
 * a live appointment of the same host are excluded.
 */
export async function getOpenSlots(handle: string, typeId: string): Promise<OpenSlot[]> {
  const { home } = await requireActiveMember(handle)
  const [type] = await db
    .select()
    .from(homeAppointmentType)
    .where(and(eq(homeAppointmentType.id, typeId), eq(homeAppointmentType.homeId, home.id), eq(homeAppointmentType.active, true)))
    .limit(1)
  if (!type) throw new Error("Appointment type not found.")

  const windows = await db
    .select()
    .from(homeAppointmentAvailability)
    .where(eq(homeAppointmentAvailability.typeId, typeId))
  if (windows.length === 0) return []

  const duration = type.durationMinutes
  const now = Date.now()

  // Slots already taken by this host (any live appointment) block the time.
  const taken = await db
    .select({ startsAt: homeAppointment.startsAt })
    .from(homeAppointment)
    .where(
      and(
        eq(homeAppointment.homeId, home.id),
        type.hostUserId ? eq(homeAppointment.hostUserId, type.hostUserId) : eq(homeAppointment.typeId, typeId),
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

export type BookResult =
  | { kind: "confirmed"; appointmentId: string; conversationId: number }
  | { kind: "payment"; appointmentId: string; clientSecret: string }

/**
 * Books a slot of an appointment type. Free types confirm immediately and
 * auto-create the dedicated conversation; paid types create a pending
 * appointment + a Stripe Checkout Session and defer the conversation until the
 * payment is confirmed. Price/duration are always recomputed from the type,
 * never trusted from the client.
 */
export async function bookAppointment(input: { handle: string; typeId: string; slotStartISO: string }): Promise<BookResult> {
  const { user, home } = await requireActiveMember(input.handle)

  const [type] = await db
    .select()
    .from(homeAppointmentType)
    .where(
      and(
        eq(homeAppointmentType.id, input.typeId),
        eq(homeAppointmentType.homeId, home.id),
        eq(homeAppointmentType.active, true),
      ),
    )
    .limit(1)
  if (!type) throw new Error("Appointment type not found.")

  const hostUserId = type.hostUserId ?? (await resolveHomeOwnerId(home.id))
  if (!hostUserId) throw new Error("This appointment type has no host configured.")
  if (hostUserId === user.id) throw new Error("You can't book an appointment with yourself.")

  const start = new Date(input.slotStartISO)
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    throw new Error("That time is no longer available.")
  }

  // Validate the slot falls on a real availability boundary for this type.
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

  const endsAt = new Date(start.getTime() + type.durationMinutes * 60_000)
  const [hostUser] = await db.select().from(userTable).where(eq(userTable.id, hostUserId)).limit(1)

  const appointmentId = crypto.randomUUID()
  const isPaid = type.priceCents != null && type.priceCents > 0

  // Guard against a double-booking of the same host slot, then insert.
  const conflict = await db
    .select({ id: homeAppointment.id })
    .from(homeAppointment)
    .where(
      and(
        eq(homeAppointment.homeId, home.id),
        eq(homeAppointment.hostUserId, hostUserId),
        eq(homeAppointment.startsAt, start),
        inArray(homeAppointment.status, ["upcoming", "pending_payment"]),
      ),
    )
    .limit(1)
  if (conflict.length > 0) throw new Error("That time was just taken. Please pick another.")

  await db.insert(homeAppointment).values({
    id: appointmentId,
    homeId: home.id,
    memberUserId: user.id,
    memberName: user.name || user.email || "Member",
    hostUserId,
    hostName: hostUser?.name ?? type.hostName ?? "Host",
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
  })

  if (!isPaid) {
    const conversationId = await createAppointmentConversation(appointmentId)
    revalidatePath("/appointments")
    return { kind: "confirmed", appointmentId, conversationId }
  }

  if (!isStripeConfigured()) throw new Error("Payments are not configured.")
  const session = await stripe.checkout.sessions.create(
    {
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: type.currency,
            product_data: { name: type.title, description: `Appointment · ${type.durationMinutes} min` },
            // Amount recomputed server-side from the type — never from the client.
            unit_amount: type.priceCents as number,
          },
          quantity: 1,
        },
      ],
      metadata: { appointmentId, homeId: home.id, kind: "home_appointment" },
    },
    // Idempotency key per appointment so a retry can't create a second session.
    { idempotencyKey: `appt_${appointmentId}` },
  )

  await db
    .update(homeAppointment)
    .set({ stripeSessionId: session.id, updatedAt: new Date() })
    .where(eq(homeAppointment.id, appointmentId))

  return { kind: "payment", appointmentId, clientSecret: session.client_secret as string }
}

/**
 * Reconciles a paid appointment after Checkout completes. Verifies the session
 * with Stripe (source of truth), flips payment + booking status, and lazily
 * creates the conversation. Idempotent: safe to call from both the success
 * handler and the webhook, and safe to call repeatedly.
 */
export async function confirmAppointmentPaid(appointmentId: string): Promise<{ conversationId: number | null }> {
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.id, appointmentId)).limit(1)
  if (!a) throw new Error("Appointment not found.")

  // Already reconciled — return the existing conversation.
  if (a.paymentStatus === "paid" && a.conversationId) return { conversationId: a.conversationId }

  if (!a.stripeSessionId) throw new Error("No payment session for this appointment.")
  const session = await stripe.checkout.sessions.retrieve(a.stripeSessionId)
  if (session.payment_status !== "paid") {
    return { conversationId: a.conversationId ?? null }
  }

  await db
    .update(homeAppointment)
    .set({ paymentStatus: "paid", status: "upcoming", updatedAt: new Date() })
    .where(eq(homeAppointment.id, appointmentId))

  const conversationId = a.conversationId ?? (await createAppointmentConversation(appointmentId))
  revalidatePath("/appointments")
  return { conversationId }
}

/* -------------------------------------------------------------------------- */
/* The core link: auto-create the dedicated conversation                      */
/* -------------------------------------------------------------------------- */

/**
 * Creates the private conversation that belongs to an appointment and links the
 * two entities both ways. Reuses the existing DM stack (dm_conversation +
 * dm_message) rather than a parallel messaging system, but marks the row
 * kind='appointment' so it is a DEDICATED thread (not deduped against the
 * pair's general DM). Seeds a system summary message. Idempotent per appointment.
 */
async function createAppointmentConversation(appointmentId: string): Promise<number> {
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.id, appointmentId)).limit(1)
  if (!a) throw new Error("Appointment not found.")
  if (a.conversationId) return a.conversationId
  if (!a.hostUserId) throw new Error("Appointment has no host.")

  const [userAId, userBId] = a.memberUserId < a.hostUserId ? [a.memberUserId, a.hostUserId] : [a.hostUserId, a.memberUserId]

  const conversationId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dmConversation)
      .values({ userAId, userBId, kind: "appointment", appointmentId })
      .returning({ id: dmConversation.id })

    await tx
      .update(homeAppointment)
      .set({ conversationId: created.id, updatedAt: new Date() })
      .where(eq(homeAppointment.id, appointmentId))

    // Seed a system summary from the host so both inboxes get a preview and the
    // appointment facts are visible in the thread from the first message.
    const when = a.startsAt
    const summary = [
      `Appointment booked: ${a.title}`,
      `When: ${when.toUTCString()}`,
      `Duration: ${a.durationMinutes} min`,
      a.useFrequencyLive ? "Meeting: Frequency Live" : a.location ? `Location: ${a.location}` : "Meeting: in person",
      a.paymentStatus === "paid"
        ? "Payment: paid"
        : a.paymentStatus === "not_required"
          ? "Payment: free"
          : "Payment: pending",
    ].join("\n")

    await tx.insert(dmMessage).values({
      conversationId: created.id,
      senderId: a.hostUserId as string,
      body: summary,
    })
    await tx
      .update(dmConversation)
      .set({ lastMessageAt: new Date() })
      .where(eq(dmConversation.id, created.id))

    return created.id
  })

  return conversationId
}

/* -------------------------------------------------------------------------- */
/* Member: my appointments                                                    */
/* -------------------------------------------------------------------------- */

/** Every appointment the current user is the MEMBER of, across all their Homes. */
export async function getMyAppointments(): Promise<MyAppointmentRow[]> {
  const user = await requireUser()
  const rows = await db
    .select({ a: homeAppointment, org: organization })
    .from(homeAppointment)
    .innerJoin(home, eq(home.id, homeAppointment.homeId))
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(and(eq(homeAppointment.memberUserId, user.id), isNull(homeAppointment.memberHiddenAt)))
    .orderBy(desc(homeAppointment.startsAt))

  return rows.map(({ a, org }) => ({
    id: a.id,
    title: a.title,
    homeHandle: org.handle,
    homeName: org.name,
    hostName: a.hostName,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    durationMinutes: a.durationMinutes,
    status: deriveDisplayStatus(a),
    paymentStatus: a.paymentStatus as PaymentStatus,
    priceCents: a.priceCents,
    currency: a.currency,
    useFrequencyLive: a.useFrequencyLive,
    location: a.location,
    conversationId: a.conversationId,
  }))
}

/**
 * Every appointment the current user HOSTS in the given Home — the admin/host
 * view. Requires `appointments.manage` in that Home. Shapes rows as
 * `MyAppointmentRow` but puts the MEMBER's name in `hostName` so the shared card
 * renders the counterpart correctly (in the member view that field is the host;
 * here it is the person who booked).
 */
export async function getHostAppointments(handle: string): Promise<MyAppointmentRow[]> {
  const { user, home } = await requireApptManager(handle)
  const [org] = await db.select().from(organization).where(eq(organization.id, home.organizationId)).limit(1)

  const rows = await db
    .select()
    .from(homeAppointment)
    .where(
      and(
        eq(homeAppointment.homeId, home.id),
        eq(homeAppointment.hostUserId, user.id),
        isNull(homeAppointment.hostHiddenAt),
      ),
    )
    .orderBy(desc(homeAppointment.startsAt))

  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    homeHandle: org?.handle ?? handle,
    homeName: org?.name ?? "",
    // Counterpart shown on the card is the member who booked, not the host.
    hostName: a.memberName,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    durationMinutes: a.durationMinutes,
    status: deriveDisplayStatus(a),
    paymentStatus: a.paymentStatus as PaymentStatus,
    priceCents: a.priceCents,
    currency: a.currency,
    useFrequencyLive: a.useFrequencyLive,
    location: a.location,
    conversationId: a.conversationId,
  }))
}

export type ConversationAppointment = {
  appointmentId: string
  title: string
  hostName: string | null
  memberName: string
  startsAt: string
  endsAt: string | null
  durationMinutes: number
  status: string
  paymentStatus: PaymentStatus
  priceCents: number | null
  currency: string
  useFrequencyLive: boolean
  location: string | null
  isHost: boolean
}

/**
 * The appointment behind an appointment-kind conversation, for the thread header
 * card. Returns null for ordinary DMs or when the caller is not a participant —
 * so the card only ever appears inside the dedicated appointment thread and only
 * for its two people.
 */
export async function getConversationAppointment(conversationId: number): Promise<ConversationAppointment | null> {
  const user = await requireUser()
  const [conv] = await db.select().from(dmConversation).where(eq(dmConversation.id, conversationId)).limit(1)
  if (!conv || conv.kind !== "appointment" || !conv.appointmentId) return null
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.id, conv.appointmentId)).limit(1)
  if (!a) return null
  if (a.memberUserId !== user.id && a.hostUserId !== user.id) return null
  return {
    appointmentId: a.id,
    title: a.title,
    hostName: a.hostName,
    memberName: a.memberName,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    durationMinutes: a.durationMinutes,
    status: deriveDisplayStatus(a),
    paymentStatus: a.paymentStatus as PaymentStatus,
    priceCents: a.priceCents,
    currency: a.currency,
    useFrequencyLive: a.useFrequencyLive,
    location: a.location,
    isHost: a.hostUserId === user.id,
  }
}

/* -------------------------------------------------------------------------- */
/* The meeting: a ring-less private LiveKit room keyed to the appointment     */
/* -------------------------------------------------------------------------- */

export type MeetingWindow = "early" | "open" | "closed"

export type AppointmentMeetingState = {
  window: MeetingWindow
  opensAtISO: string
  closesAtISO: string
}

const MEETING_EARLY_MS = 10 * 60_000 // join opens 10 min before start
const MEETING_GRACE_MS = 15 * 60_000 // room stays joinable 15 min past end

function meetingBounds(startsAt: Date, endsAt: Date | null, duration: number) {
  const end = endsAt ?? new Date(startsAt.getTime() + duration * 60_000)
  return {
    opensAt: startsAt.getTime() - MEETING_EARLY_MS,
    closesAt: end.getTime() + MEETING_GRACE_MS,
  }
}

/**
 * Verifies the caller is a participant (member or host) and mints a LiveKit
 * token for the appointment's private room `appt-<id>`. Ring-less: both parties
 * join the same deterministic room directly. Only authorised participants can
 * obtain a token, so the meeting can never become a public live session.
 */
export async function getAppointmentMeetingToken(
  appointmentId: string,
): Promise<{ url: string; token: string; roomName: string; isHost: boolean }> {
  const user = await requireUser()
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.id, appointmentId)).limit(1)
  if (!a) throw new Error("Appointment not found.")

  const isHost = a.hostUserId === user.id
  const isMember = a.memberUserId === user.id
  if (!isHost && !isMember) throw new Error("You are not a participant in this appointment.")
  if (!a.useFrequencyLive) throw new Error("This appointment is not a Frequency Live meeting.")
  if (a.status === "cancelled") throw new Error("This appointment was cancelled.")
  if (a.paymentStatus === "pending") throw new Error("This appointment is awaiting payment.")
  if (!isLiveKitConfigured()) throw new Error("Live meetings are not configured.")

  const { opensAt, closesAt } = meetingBounds(a.startsAt, a.endsAt, a.durationMinutes)
  const now = Date.now()
  if (now < opensAt) throw new Error("The meeting hasn't opened yet.")
  if (now > closesAt) throw new Error("The meeting has ended.")

  // Record attendance the first time each party joins — this is what later
  // resolves the appointment to "Finished" (both joined) vs "No show".
  const joinedAt = new Date()
  if (isHost && !a.hostAttendedAt) {
    await db
      .update(homeAppointment)
      .set({ hostAttendedAt: joinedAt, updatedAt: joinedAt })
      .where(eq(homeAppointment.id, a.id))
  } else if (isMember && !a.memberAttendedAt) {
    await db
      .update(homeAppointment)
      .set({ memberAttendedAt: joinedAt, updatedAt: joinedAt })
      .where(eq(homeAppointment.id, a.id))
  }

  const [profile] = await db.select().from(userTable).where(eq(userTable.id, user.id)).limit(1)
  const roomName = `appt-${a.id}`
  const token = await createAccessToken({
    roomName,
    identity: user.id,
    name: profile?.name ?? "Participant",
    canPublish: true, // both participants are equals in a 1:1 meeting
    metadata: JSON.stringify({ image: profile?.image ?? null, isHost }),
  })
  return { url: LIVEKIT_URL, token, roomName, isHost }
}

/** The live join window for an appointment, so the UI can gate the button. */
export async function getMeetingState(appointmentId: string): Promise<AppointmentMeetingState> {
  const user = await requireUser()
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.id, appointmentId)).limit(1)
  if (!a) throw new Error("Appointment not found.")
  if (a.hostUserId !== user.id && a.memberUserId !== user.id) {
    throw new Error("You are not a participant in this appointment.")
  }
  const { opensAt, closesAt } = meetingBounds(a.startsAt, a.endsAt, a.durationMinutes)
  const now = Date.now()
  const window: MeetingWindow = now < opensAt ? "early" : now > closesAt ? "closed" : "open"
  return {
    window,
    opensAtISO: new Date(opensAt).toISOString(),
    closesAtISO: new Date(closesAt).toISOString(),
  }
}

/** Marks an appointment completed (host only). Keeps the conversation available. */
export async function completeAppointment(handle: string, appointmentId: string) {
  const { homeId } = await requireApptManager(handle)
  await db
    .update(homeAppointment)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(homeAppointment.id, appointmentId), eq(homeAppointment.homeId, homeId)))
  revalidatePath(`/org/${handle}/admin/appointments`)
}

/**
 * Remove a PAST appointment from the caller's OWN timeline. Non-destructive and
 * one-sided: the member dismisses via `memberHiddenAt`, the host via
 * `hostHiddenAt`, so the counterpart keeps seeing the row and the shared
 * conversation is untouched. Guarded to finished/ended sessions only — you can
 * never make an upcoming appointment silently vanish for one party.
 */
export async function hideAppointment(appointmentId: string) {
  const user = await requireUser()
  const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.id, appointmentId)).limit(1)
  if (!a) throw new Error("Appointment not found.")

  // Identify the caller's relationship to the appointment. Never derive it from
  // anything client-sent — match the session user against the stored parties.
  const isMember = a.memberUserId === user.id
  const isHost = !!a.hostUserId && a.hostUserId === user.id
  if (!isMember && !isHost) throw new Error("You can't remove this appointment.")

  // Only past/finished sessions may be dismissed from a timeline.
  const display = deriveDisplayStatus(a)
  const finished = display === "completed" || display === "no_show" || display === "cancelled"
  const ended = (a.endsAt ?? a.startsAt).getTime() < Date.now()
  if (!finished && !ended) throw new Error("Only past appointments can be removed.")

  await db
    .update(homeAppointment)
    .set(isMember ? { memberHiddenAt: new Date() } : { hostHiddenAt: new Date() })
    .where(eq(homeAppointment.id, appointmentId))

  revalidatePath("/appointments")
  revalidatePath("/messages")
}
