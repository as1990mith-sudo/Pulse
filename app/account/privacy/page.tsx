import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AccountPageShell } from "@/components/account/account-ui"
import { MentionPrivacyControl } from "@/components/settings/mention-privacy-control"
import { getMyMentionPrivacy } from "@/app/actions/mentions"
import { getCurrentUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Privacy · Account",
  description: "Control who can interact with you.",
}

export default async function AccountPrivacyPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const privacy = await getMyMentionPrivacy()

  return (
    <AccountPageShell title="Privacy">
      <MentionPrivacyControl initialValue={privacy} />
    </AccountPageShell>
  )
}
