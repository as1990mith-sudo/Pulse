import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/rbac"
import { listReports } from "@/lib/admin/reports"
import { ReportsModeration } from "@/components/admin/reports/reports-moderation"

export const metadata: Metadata = { title: "Reports & Moderation · Frequency Admin" }

export default async function ReportsPage() {
  const actor = await requirePermission("reports.view")
  const { rows, total, counts } = await listReports("pending", 0)
  return (
    <ReportsModeration
      initialRows={rows}
      initialTotal={total}
      initialCounts={counts}
      canAct={hasPermission(actor.role, "reports.action")}
    />
  )
}
