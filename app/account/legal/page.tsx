import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Cookie, FileText, ScrollText, ShieldCheck } from "lucide-react"
import { AccountGroup, AccountPageShell, AccountRow } from "@/components/account/account-ui"
import { getCurrentUser } from "@/lib/session"
import { LEGAL_DOCUMENTS } from "@/lib/legal-content"

export const metadata: Metadata = {
  title: "Legal · Account",
  description: "Policies and terms for Frequency Home.",
}

const ICONS = {
  "privacy-policy": ShieldCheck,
  "terms-of-service": FileText,
  "community-guidelines": ScrollText,
  "cookie-policy": Cookie,
} as const

export default async function LegalIndexPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  return (
    <AccountPageShell title="Legal">
      <AccountGroup>
        {LEGAL_DOCUMENTS.map((doc) => (
          <AccountRow
            key={doc.slug}
            href={`/account/legal/${doc.slug}`}
            icon={ICONS[doc.slug]}
            label={doc.title}
          />
        ))}
      </AccountGroup>
    </AccountPageShell>
  )
}
