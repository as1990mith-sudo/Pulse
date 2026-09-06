import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AccountPageShell } from "@/components/account/account-ui"
import { ProfileEditor } from "@/components/account/profile-editor"
import { getMyAccountInfo } from "@/app/actions/account"

export const metadata: Metadata = {
  title: "Profile · Account",
  description: "Manage your personal identity.",
}

export default async function AccountProfilePage() {
  const info = await getMyAccountInfo()
  if (!info) redirect("/sign-in")

  return (
    <AccountPageShell title="Profile">
      <ProfileEditor initial={info} />
    </AccountPageShell>
  )
}
