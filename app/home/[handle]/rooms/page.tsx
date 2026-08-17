import { requireHomeMembership } from "@/lib/home/access"
import { getHomeLiveSessions } from "@/app/actions/home-surfaces"
import { HomeLiveSurface } from "@/components/home/live/home-live-surface"
import { Users2 } from "lucide-react"

export default async function HomeRoomsPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const { home } = await requireHomeMembership(handle)
  // Rooms = conversation gatherings hosted by this Home's members. Surfaced
  // here, entered through the existing global room experience.
  const { rooms } = await getHomeLiveSessions(home.id)

  return (
    <HomeLiveSurface
      handle={handle}
      title="Rooms"
      subtitle={`Live conversations with ${home.name}`}
      sessions={rooms}
      emptyTitle="No open rooms"
      emptyBody="When a member of your community starts a conversation room, it appears here to join."
      icon={Users2}
      startKind="room"
      startLabel="Start a room"
    />
  )
}
