import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AccountPageShell } from "@/components/account/account-ui"
import { DataControls } from "@/components/account/data-controls"
import { getCurrentUser } from "@/lib/session"
import { getMyOwnedHomes } from "@/app/actions/account"

export const metadata: Metadata = {
  title: "Data & Privacy · Account",
  description: "Download your data or delete your account.",
}

export default async function AccountDataPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const ownedHomes = await getMyOwnedHomes()

  return (
    <AccountPageShell title="Data & Privacy">
      <DataControls ownedHomes={ownedHomes} />
    </AccountPageShell>
  )
}
