import type { Metadata } from "next"
import {
  getActivityTimeline,
  getContentStatus,
  getLiveActivity,
  getModerationQueue,
  getPlatformHealth,
} from "@/lib/admin/command-centre"
import { getAdminActor } from "@/lib/admin-auth"
import { CommandCentre } from "@/components/admin/command-centre/command-centre"

export const metadata: Metadata = {
  title: "Command Centre · Frequency Admin",
}

// Always reflect the true current state of the platform.
export const dynamic = "force-dynamic"

export default async function AdminCommandCentrePage() {
  const ctx = await getAdminActor()
  const [activity, queue, content, health, timeline] = await Promise.all([
    getLiveActivity(),
    getModerationQueue(),
    getContentStatus(),
    getPlatformHealth(),
    getActivityTimeline(),
  ])

  return (
    <CommandCentre
      adminName={ctx?.name ?? "Admin"}
      activity={activity}
      queue={queue}
      content={content}
      health={health}
      timeline={timeline.map((t) => ({
        id: t.id,
        action: t.action,
        targetType: t.targetType,
        result: t.result,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  )
}
