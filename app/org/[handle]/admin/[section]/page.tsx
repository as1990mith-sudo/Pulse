import { notFound } from "next/navigation"
import { getHomeAdminSection } from "@/lib/home/admin-nav"
import { getHomeMembers, getHomeAdminOverview } from "@/app/actions/home"
import { getHomeBookings, getHomeAppointments } from "@/app/actions/home-scheduling"
import { getHomeEventAttendance } from "@/app/actions/announcements"
import { EventsAttendanceManager } from "@/components/home/admin/events-attendance-manager"
import { MembersManager } from "@/components/home/admin/members-manager"
import { SubscriptionManager } from "@/components/home/admin/subscription-manager"
import { SettingsManager } from "@/components/home/admin/settings-manager"
import { ContentManager } from "@/components/home/admin/content-manager"
import { BookingsManager } from "@/components/home/admin/bookings-manager"
import { AppointmentsManager } from "@/components/home/admin/appointments-manager"
import { ComingSoonSection } from "@/components/home/admin/coming-soon-section"

export default async function HomeAdminSectionPage({
  params,
}: {
  params: Promise<{ handle: string; section: string }>
}) {
  const { handle, section } = await params
  const meta = getHomeAdminSection(section)
  // "overview" is the index route; unknown slugs 404.
  if (!meta || section === "overview") notFound()

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin Console</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance lg:text-3xl">{meta.label}</h1>
        {meta.description && (
          <p className="max-w-2xl text-pretty text-sm text-muted-foreground">{meta.description}</p>
        )}
      </header>

      <SectionBody handle={handle} section={section} />
    </div>
  )
}

async function SectionBody({ handle, section }: { handle: string; section: string }) {
  if (section === "members") {
    const members = await getHomeMembers(handle)
    // Owners/admins can manage; the action layer re-checks on every mutation.
    return <MembersManager handle={handle} initialMembers={members} canManage />
  }

  if (section === "subscription") {
    const { home } = await getHomeAdminOverview(handle)
    return <SubscriptionManager handle={handle} currentPlan={home.plan} />
  }

  if (section === "settings") {
    const { home } = await getHomeAdminOverview(handle)
    return <SettingsManager home={home} />
  }

  if (section === "content") {
    const { home } = await getHomeAdminOverview(handle)
    return <ContentManager handle={handle} homeName={home.name} />
  }

  if (section === "bookings") {
    const bookings = await getHomeBookings(handle)
    return <BookingsManager handle={handle} initialBookings={bookings} />
  }

  if (section === "appointments") {
    const appointments = await getHomeAppointments(handle)
    return <AppointmentsManager handle={handle} initialAppointments={appointments} />
  }

  if (section === "events") {
    const events = await getHomeEventAttendance(handle)
    return <EventsAttendanceManager handle={handle} events={events} />
  }

  const meta = getHomeAdminSection(section)!
  return <ComingSoonSection label={meta.label} description={meta.description} />
}
