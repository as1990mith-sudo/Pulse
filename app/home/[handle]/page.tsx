import type { Metadata } from "next"
import { requireHomeMembership } from "@/lib/home/access"
import { getHomeDashboard } from "@/app/actions/home-surfaces"
import { HomeDashboard } from "@/components/home/dashboard/home-dashboard"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  return { title: `Home · ${handle}` }
}

export default async function HomeDashboardPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  // Membership is already enforced by the layout; we re-resolve the Home here to
  // get its ids for the (Home-scoped) dashboard query.
  const { home } = await requireHomeMembership(handle)
  const data = await getHomeDashboard(home.id, home.organizationId)

  return <HomeDashboard data={data} home={{ handle: home.handle, name: home.name, logo: home.orgLogo }} />
}
