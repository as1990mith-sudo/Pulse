import { notFound } from "next/navigation"
import { getHomeAdminSection } from "@/lib/home/admin-nav"
import { getHomeAdminOverview } from "@/app/actions/home"
import { getMembersDirectory, getHomeAdmins } from "@/app/actions/home-members"
import { defaultQuery } from "@/lib/home/members"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { homeRoleHasPermission } from "@/lib/home/roles"
import { getBroadcasts } from "@/app/actions/home-broadcast"
import { listAppointmentTypes, listHomeBookings } from "@/app/actions/home-appointments"
import { getHomeEventRegistrations } from "@/app/actions/event-admin"
import { EventRegistrationsManager } from "@/components/home/admin/event-registrations-manager"
import { EventAudienceComposer } from "@/components/home/admin/event-audience-composer"
import { MembersCommandCentre } from "@/components/home/admin/members/members-command-centre"
import { AdminsRoster } from "@/components/home/admin/admins/admins-roster"
import { ReportsManager } from "@/components/home/admin/reports/reports-manager"
import { getHomeReports } from "@/app/actions/home-reports"
import { SubscriptionManager } from "@/components/home/admin/subscription-manager"
import { SettingsManager } from "@/components/home/admin/settings-manager"
import { ReviewTabManager } from "@/components/home/admin/review-tab-manager"
import { ContentManager } from "@/components/home/admin/content-manager"
import { BroadcastManager } from "@/components/home/admin/broadcast/broadcast-manager"
import { AppointmentsAdmin } from "@/components/home/admin/appointments-admin"

export default async function HomeAdminSectionPage({
  params,
}: {
  params: Promise<{ handle: string; section: string }>
}) {
  const { handle, section } = await params

  // "admins" is reached from the ADMINS stat card, not the nav registry, so it
  // is resolved before the section-meta lookup. It shows only current admins and
  // their assigned roles, read-only.
  if (section === "admins") {
    const admins = await getHomeAdmins(handle)
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">Admins</h1>
          <p className="mt-1 text-sm text-muted-foreground">Current admins and their assigned roles.</p>
        </header>
        <AdminsRoster admins={admins} />
      </div>
    )
  }

  const meta = getHomeAdminSection(section)
  // "overview" is the index route; unknown or deprecated slugs 404.
  if (!meta || section === "overview") notFound()

  // The Members command centre owns its own compact header (title + live count +
  // timeframe), so it renders full-bleed without the default section header.
  if (section === "members") {
    const initialQuery = defaultQuery()
    const [initialData, home] = await Promise.all([
      getMembersDirectory(handle, initialQuery),
      getHomeByHandle(handle),
    ])
    const membership = home ? await getViewerMembership(home.id) : null
    const canManage = homeRoleHasPermission(membership?.role, "members.manage")
    return (
      <MembersCommandCentre
        handle={handle}
        initialQuery={initialQuery}
        initialData={initialData}
        canManage={canManage}
      />
    )
  }

  // Reports owns its own header (title + live status filters), so it renders
  // full-bleed like the Members command centre.
  if (section === "reports") {
    const { reports, counts } = await getHomeReports(handle, "all")
    return <ReportsManager handle={handle} initialReports={reports} initialCounts={counts} />
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">{meta.label}</h1>
      </header>

      <SectionBody handle={handle} section={section} />
    </div>
  )
}

async function SectionBody({ handle, section }: { handle: string; section: string }) {
  if (section === "subscription") {
    const { home } = await getHomeAdminOverview(handle)
    return (
      <SubscriptionManager
        handle={handle}
        currentPlan={home.plan}
        currentInterval={home.planInterval}
        planStatus={home.planStatus}
        renewsAt={home.planRenewsAt ? home.planRenewsAt.toISOString() : null}
      />
    )
  }

  if (section === "settings") {
    const { home } = await getHomeAdminOverview(handle)
    return <SettingsManager home={home} />
  }

  if (section === "review-tab") {
    const { home } = await getHomeAdminOverview(handle)
    return <ReviewTabManager handle={handle} current={home.reviewTabLabel} />
  }

  if (section === "content") {
    const { home } = await getHomeAdminOverview(handle)
    return <ContentManager handle={handle} homeName={home.name} />
  }

  if (section === "broadcast") {
    const broadcasts = await getBroadcasts(handle)
    return <BroadcastManager handle={handle} initialBroadcasts={broadcasts} />
  }

  if (section === "appointments") {
    const [types, bookings] = await Promise.all([listAppointmentTypes(handle), listHomeBookings(handle)])
    return <AppointmentsAdmin handle={handle} initialTypes={types} initialBookings={bookings} />
  }

  if (section === "events") {
    // Registration is the only attendance format, so this section shows the
    // registration records and the audiences built from them.
    const registrations = await getHomeEventRegistrations(handle)
    return (
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Registrations
          </h2>
          <EventRegistrationsManager handle={handle} events={registrations} />
        </section>
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Audiences
          </h2>
          <EventAudienceComposer
            handle={handle}
            events={registrations.map((e) => ({ id: e.id, title: e.title }))}
          />
        </section>
      </div>
    )
  }

  notFound()
}
