import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/rbac"
import { listActiveSessions } from "@/lib/admin/security"
import { ActiveSessionsView } from "@/components/admin/security/active-sessions-view"

export const metadata: Metadata = { title: "Active Sessions · Frequency Admin" }

export default async function ActiveSessionsPage() {
  const actor = await requirePermission("security.view")
  const rows = await listActiveSessions()
  return <ActiveSessionsView initialRows={rows} canRevoke={hasPermission(actor.role, "roles.manage")} />
}
