import { notFound } from "next/navigation"
import { requireHomeMembership } from "@/lib/home/access"
import { getOrganizationByHandle } from "@/app/actions/organizations"
import { getOrganizationEvents } from "@/app/actions/org-content"
import { OrgEventsTab } from "@/components/org/org-events-tab"

export default async function HomeEventsPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  // Membership enforced by the layout. Events are already org-scoped, so we
  // reuse the org profile's Events experience verbatim.
  await requireHomeMembership(handle)
  const org = await getOrganizationByHandle(handle)
  if (!org) notFound()
  const events = await getOrganizationEvents(org.id)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Events</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Gatherings from {org.name}</p>
      </header>
      <OrgEventsTab org={org} events={events} />
    </div>
  )
}
