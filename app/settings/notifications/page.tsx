import { redirect } from "next/navigation"

// Notifications now live inside the Account section. Keep this route working for
// any old links by sending it to its new home.
export default function LegacyNotificationSettingsRedirect() {
  redirect("/account/notifications")
}
