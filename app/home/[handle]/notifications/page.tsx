import { requireHomeMembership } from "@/lib/home/access"
import { getHomeNotifications } from "@/app/actions/notifications"
import { NotificationsList } from "@/components/notifications-list"

export default async function HomeNotificationsPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const { home } = await requireHomeMembership(handle)
  const initial = await getHomeNotifications(home.id)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Notifications</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Activity from {home.name}</p>
      </header>

      <NotificationsList initial={initial} homeId={home.id} />
    </div>
  )
}
