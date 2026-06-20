import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { NotificationsList } from "@/components/notifications-list"
import { getNotifications, markNotificationsRead } from "@/app/actions/notifications"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Notifications — Frequency",
}

export default async function NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const notifications = (await getNotifications()) ?? []
  // Opening the page marks everything as read.
  await markNotificationsRead()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Engagement on your posts and alerts when people you follow go live.
        </p>
        <NotificationsList initial={notifications} />
      </main>
    </div>
  )
}
