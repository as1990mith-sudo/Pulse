import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/rbac"
import { listBroadcasts, getBroadcastAnalytics, getAudienceSizes } from "@/lib/admin/broadcast"
import { BroadcastCentre } from "@/components/admin/broadcast/broadcast-centre"

export const metadata: Metadata = { title: "Push Notifications · Frequency Admin" }

export default async function PushPage() {
  const actor = await requirePermission("push.send")
  const [rows, analytics, audienceSizes] = await Promise.all([
    listBroadcasts(),
    getBroadcastAnalytics(),
    getAudienceSizes(),
  ])
  return (
    <BroadcastCentre
      initialRows={rows}
      analytics={analytics}
      audienceSizes={audienceSizes}
      canPush={hasPermission(actor.role, "push.send")}
      defaultChannel="push"
    />
  )
}
