import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { home, homeAppointment, organization, user as userTable } from "@/lib/db/schema"
import { appointmentManageUrl } from "@/lib/app-url"
import { sendAppointmentEmail, type AppointmentEmailKind } from "@/lib/email"

/**
 * Sends an appointment confirmation / reschedule / cancellation email for a
 * committed appointment. Resolves the recipient (a guest's provided email, or
 * the member's account email) and the Home name, then delegates to the email
 * layer. Best-effort: a mail failure is logged and swallowed so it can never
 * roll back a booking change that already succeeded in the database.
 *
 * MUST be called only AFTER the booking change is committed.
 */
export async function notifyAppointment(appointmentId: string, kind: AppointmentEmailKind): Promise<void> {
  try {
    const [a] = await db.select().from(homeAppointment).where(eq(homeAppointment.id, appointmentId)).limit(1)
    if (!a) return

    // Recipient: guest email if this was a guest booking, else the member's
    // account email.
    let to = a.guestEmail ?? null
    let name = a.guestName ?? a.memberName ?? null
    if (!to && a.memberUserId) {
      const [u] = await db.select().from(userTable).where(eq(userTable.id, a.memberUserId)).limit(1)
      to = u?.email ?? null
      name = u?.name ?? name
    }
    if (!to) return // nobody to email

    const [org] = await db
      .select({ name: organization.name })
      .from(home)
      .innerJoin(organization, eq(organization.id, home.organizationId))
      .where(eq(home.id, a.homeId))
      .limit(1)

    if (!a.manageToken) return // no manage link => can't send a usable email

    await sendAppointmentEmail(kind, {
      to,
      name,
      title: a.title,
      homeName: org?.name ?? "your Home",
      hostName: a.hostName,
      whenISO: a.startsAt.toISOString(),
      durationMinutes: a.durationMinutes,
      useFrequencyLive: a.useFrequencyLive,
      location: a.location,
      manageUrl: appointmentManageUrl(a.manageToken),
    })
  } catch (err) {
    console.log("[v0] notifyAppointment failed (non-fatal):", err)
  }
}
