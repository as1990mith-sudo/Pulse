import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { listOrganizationsForReview } from "@/app/actions/admin-verification"
import { VerificationConsole } from "@/components/admin/verification-console"

export const metadata: Metadata = { title: "Verification · Frequency Admin" }

export default async function Page() {
  await requirePermission("users.moderate")
  const rows = await listOrganizationsForReview()
  return <VerificationConsole initialRows={rows} />
}
