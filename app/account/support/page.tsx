import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Flag, LifeBuoy, Mail, ShieldAlert } from "lucide-react"
import { AccountGroup, AccountPageShell, AccountRow } from "@/components/account/account-ui"
import { getCurrentUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Support · Account",
  description: "Get help with Frequency Home.",
}

const SUPPORT_EMAIL = "support@frequency.app"

export default async function AccountSupportPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  return (
    <AccountPageShell title="Support">
      <AccountGroup>
        <AccountRow
          href={`mailto:${SUPPORT_EMAIL}`}
          icon={LifeBuoy}
          label="Help & Support"
          external
        />
        <AccountRow
          href={`mailto:${SUPPORT_EMAIL}?subject=Contact%20Frequency%20Support`}
          icon={Mail}
          label="Contact Frequency Support"
          external
        />
        <AccountRow
          href={`mailto:${SUPPORT_EMAIL}?subject=Report%20a%20Problem`}
          icon={Flag}
          label="Report a Problem"
          external
        />
        <AccountRow
          href={`mailto:${SUPPORT_EMAIL}?subject=Report%20Inappropriate%20Content%20or%20Behaviour`}
          icon={ShieldAlert}
          label="Report Content or Behaviour"
          external
        />
      </AccountGroup>
    </AccountPageShell>
  )
}
