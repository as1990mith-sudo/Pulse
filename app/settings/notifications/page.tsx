import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { getNotificationPreferences, getPushDeviceCount } from "@/app/actions/push"
import { getCurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Notifications · Frequency",
  description: "Choose what Frequency notifies you about, and on which devices.",
}

export default async function NotificationSettingsPage() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-lg font-semibold">Sign in to manage notifications</p>
            <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
              Notification settings are tied to your account and the devices you use.
            </p>
            <div className="flex gap-2">
              <Button render={<Link href="/sign-in" />} nativeButton={false}>
                Sign in
              </Button>
              <Button render={<Link href="/sign-up" />} nativeButton={false} variant="secondary">
                Create account
              </Button>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  // Both are cheap owner-scoped reads, so fetch together rather than waterfall.
  const [preferences, deviceCount] = await Promise.all([
    getNotificationPreferences(),
    getPushDeviceCount(),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Link
          href="/settings/privacy"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Privacy
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-balance">Notifications</h1>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
            Choose what reaches you, and on which devices.
          </p>
        </header>
        <NotificationSettings initialPreferences={preferences} initialDeviceCount={deviceCount} />
      </main>
    </div>
  )
}
