import { requireHomeMembership } from "@/lib/home/access"
import { Bell } from "lucide-react"

export default async function HomeNotificationsPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const { home } = await requireHomeMembership(handle)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Notifications</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Activity from {home.name}</p>
      </header>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Bell className="size-6" />
        </span>
        <p className="mt-3 text-sm font-medium text-foreground">You&apos;re all caught up</p>
        <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
          New posts, events and replies from {home.name} will show up here. A full activity inbox is coming soon.
        </p>
      </div>
    </div>
  )
}
