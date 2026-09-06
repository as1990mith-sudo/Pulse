import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AccountPageShell } from "@/components/account/account-ui"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { getNotificationPreferences, getPushDeviceCount } from "@/app/actions/push"
import { getCurrentUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Notifications · Account",
  description: "Choose what Frequency Home notifies you about.",
}

export default async function AccountNotificationsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const [preferences, deviceCount] = await Promise.all([
    getNotificationPreferences(),
    getPushDeviceCount(),
  ])

  return (
    <AccountPageShell title="Notifications">
      <NotificationSettings initialPreferences={preferences} initialDeviceCount={deviceCount} />
    </AccountPageShell>
  )
}
