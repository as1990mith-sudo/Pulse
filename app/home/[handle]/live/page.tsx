import { requireHomeMembership } from "@/lib/home/access"
import { getHomeLiveSessions } from "@/app/actions/home-surfaces"
import { HomeLiveSurface } from "@/components/home/live/home-live-surface"
import { Radio } from "lucide-react"

export default async function HomeLivePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const { home } = await requireHomeMembership(handle)
  // Live = podcast / video broadcasts hosted by this Home's members. Surfaced
  // here, entered through the existing global live experience.
  const { broadcasts } = await getHomeLiveSessions(home.id)

  return (
    <HomeLiveSurface
      title="Live"
      subtitle={`Broadcasts from ${home.name}`}
      sessions={broadcasts}
      emptyTitle="Nothing live right now"
      emptyBody="When a member of your community goes live with a broadcast, you'll be able to join it here."
      icon={Radio}
    />
  )
}
