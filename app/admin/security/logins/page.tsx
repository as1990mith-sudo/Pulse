import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { listLoginHistory } from "@/lib/admin/security"
import { LoginHistoryView } from "@/components/admin/security/login-history-view"

export const metadata: Metadata = { title: "Login History · Frequency Admin" }

export default async function LoginHistoryPage() {
  await requirePermission("security.view")
  const { rows } = await listLoginHistory(0)
  return <LoginHistoryView rows={rows} />
}
