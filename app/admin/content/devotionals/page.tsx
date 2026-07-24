import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/rbac"
import { listDevotionals, getDevotionalAnalytics } from "@/lib/admin/devotionals"
import { DevotionalsManager } from "@/components/admin/devotionals/devotionals-manager"

export const metadata: Metadata = { title: "Devotionals · Frequency Admin" }

export default async function DevotionalsPage() {
  const actor = await requirePermission("devotionals.manage")
  const [{ rows, total, counts }, analytics] = await Promise.all([
    listDevotionals("all", 0),
    getDevotionalAnalytics(),
  ])
  return (
    <DevotionalsManager
      initialRows={rows}
      total={total}
      counts={counts}
      analytics={analytics}
      canManage={hasPermission(actor.role, "devotionals.manage")}
    />
  )
}
