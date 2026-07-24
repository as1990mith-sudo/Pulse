import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { listAuditLogs, getSecurityStats } from "@/lib/admin/security"
import { AuditLogView } from "@/components/admin/security/audit-log-view"

export const metadata: Metadata = { title: "Audit Logs · Frequency Admin" }

export default async function AuditLogsPage() {
  await requirePermission("security.view")
  const [{ rows, total }, stats] = await Promise.all([listAuditLogs({}, 0), getSecurityStats()])
  return <AuditLogView initialRows={rows} total={total} stats={stats} />
}
