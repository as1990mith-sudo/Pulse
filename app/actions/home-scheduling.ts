"use server"

import { and, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { homeAppointment, homeBooking } from "@/lib/db/schema"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { homeRoleHasPermission, type HomePermission } from "@/lib/home/roles"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/**
 * Resolves a Home by handle and asserts the caller holds the given management
 * permission in THAT Home. Returns the home id so every query below is scoped
 * to exactly one organisation — a manager of Home A can never read or mutate
 * Home B's bookings or appointments.
 */
async function requireSchedulingManager(handle: string, permission: HomePermission) {
  const user = await requireUser()
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, permission)) {
    throw new Error("You don't have permission to do that.")
  }
  return { user, homeId: home.id, handle }
}

// ---- Bookings -------------------------------------------------------------

export type BookingRow = {
  id: string
  requesterName: string
  requesterEmail: string | null
  title: string
  notes: string | null
  requestedFor: string | null
  status: string
  createdAt: string
}

export async function getHomeBookings(handle: string): Promise<BookingRow[]> {
  const { homeId } = await requireSchedulingManager(handle, "bookings.manage")
  const rows = await db
    .select()
    .from(homeBooking)
    .where(eq(homeBooking.homeId, homeId))
    .orderBy(desc(homeBooking.createdAt))
  return rows.map((r) => ({
    id: r.id,
    requesterName: r.requesterName,
    requesterEmail: r.requesterEmail,
    title: r.title,
    notes: r.notes,
    requestedFor: r.requestedFor ? r.requestedFor.toISOString() : null,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }))
}

const BOOKING_STATUSES = ["pending", "confirmed", "declined", "completed", "cancelled"] as const
type BookingStatus = (typeof BOOKING_STATUSES)[number]

export async function updateBookingStatus(handle: string, id: string, status: BookingStatus) {
  if (!BOOKING_STATUSES.includes(status)) throw new Error("Invalid status.")
  const { homeId } = await requireSchedulingManager(handle, "bookings.manage")
  // Scope the update by BOTH id and homeId so a crafted id from another Home
  // can never be mutated here.
  await db
    .update(homeBooking)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(homeBooking.id, id), eq(homeBooking.homeId, homeId)))
  revalidatePath(`/org/${handle}/admin/bookings`)
}

/**
 * A member creates a booking request inside a Home. Requires active membership
 * of that Home — the request is stamped with the Home id so it only ever
 * surfaces in that organisation's admin console.
 */
export async function createBookingRequest(input: {
  handle: string
  title: string
  notes?: string
  requestedFor?: string
}) {
  const user = await requireUser()
  const home = await getHomeByHandle(input.handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active") {
    throw new Error("You must be a member of this Home to request a booking.")
  }
  const title = input.title.trim()
  if (!title) throw new Error("Please add a short title for your request.")
  await db.insert(homeBooking).values({
    id: crypto.randomUUID(),
    homeId: home.id,
    requesterUserId: user.id,
    requesterName: user.name || user.email || "Member",
    requesterEmail: user.email ?? null,
    title,
    notes: input.notes?.trim() || null,
    requestedFor: input.requestedFor ? new Date(input.requestedFor) : null,
    status: "pending",
  })
  revalidatePath(`/org/${input.handle}/admin/bookings`)
}

// ---- Appointments ---------------------------------------------------------

export type AppointmentRow = {
  id: string
  memberName: string
  hostName: string | null
  title: string
  notes: string | null
  location: string | null
  startsAt: string
  endsAt: string | null
  status: string
}

export async function getHomeAppointments(handle: string): Promise<AppointmentRow[]> {
  const { homeId } = await requireSchedulingManager(handle, "appointments.manage")
  const rows = await db
    .select()
    .from(homeAppointment)
    .where(eq(homeAppointment.homeId, homeId))
    .orderBy(desc(homeAppointment.startsAt))
  return rows.map((r) => ({
    id: r.id,
    memberName: r.memberName,
    hostName: r.hostName,
    title: r.title,
    notes: r.notes,
    location: r.location,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    status: r.status,
  }))
}

export async function createAppointment(input: {
  handle: string
  memberName: string
  title: string
  startsAt: string
  endsAt?: string
  location?: string
  notes?: string
}) {
  const { user, homeId } = await requireSchedulingManager(input.handle, "appointments.manage")
  const title = input.title.trim()
  const memberName = input.memberName.trim()
  if (!title || !memberName) throw new Error("A title and member name are required.")
  if (!input.startsAt) throw new Error("A start time is required.")
  await db.insert(homeAppointment).values({
    id: crypto.randomUUID(),
    homeId,
    // Placeholder identity until a member picker is wired; the host is the
    // acting admin. Both are scoped to this Home only.
    memberUserId: user.id,
    memberName,
    hostUserId: user.id,
    hostName: user.name || user.email || "Host",
    title,
    notes: input.notes?.trim() || null,
    location: input.location?.trim() || null,
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    status: "upcoming",
  })
  revalidatePath(`/org/${input.handle}/admin/appointments`)
}

const APPOINTMENT_STATUSES = ["upcoming", "completed", "cancelled"] as const
type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export async function updateAppointmentStatus(handle: string, id: string, status: AppointmentStatus) {
  if (!APPOINTMENT_STATUSES.includes(status)) throw new Error("Invalid status.")
  const { homeId } = await requireSchedulingManager(handle, "appointments.manage")
  await db
    .update(homeAppointment)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(homeAppointment.id, id), eq(homeAppointment.homeId, homeId)))
  revalidatePath(`/org/${handle}/admin/appointments`)
}
