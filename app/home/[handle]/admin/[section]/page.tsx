import { notFound } from "next/navigation"
import { getHomeAdminSection } from "@/lib/home/admin-nav"
import { getHomeMembers, getHomeAdminOverview } from "@/app/actions/home"
import { MembersManager } from "@/components/home/admin/members-manager"
import { SubscriptionManager } from "@/components/home/admin/subscription-manager"
import { SettingsManager } from "@/components/home/admin/settings-manager"
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
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-balance lg:text-3xl">{meta.label}</h1>
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

  const meta = getHomeAdminSection(section)!
  return <ComingSoonSection label={meta.label} description={meta.description} />
}
