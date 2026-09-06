import { redirect } from "next/navigation"

// Privacy now lives inside the Account section. Keep this route working for any
// old links by sending it to its new home.
export default function LegacyPrivacySettingsRedirect() {
  redirect("/account/privacy")
}
