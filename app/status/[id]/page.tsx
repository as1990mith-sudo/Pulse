import Link from "next/link"
import { eq } from "drizzle-orm"
import { Clock } from "lucide-react"
import { db } from "@/lib/db"
import { statusUpdate } from "@/lib/db/schema"
import { getActiveStatusForUser } from "@/app/actions/status"
import { getCurrentUser } from "@/lib/session"
import { StatusReplay } from "@/components/status-replay"

/**
 * Deep link to a single status, opened from an inbox reply. Shows the live
 * status in the viewer, or a friendly "expired" notice once it's gone.
 */
export default async function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const statusId = Number(id)

  const expired = (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Clock className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">This status has expired</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Statuses disappear after 24 hours, so this one is no longer available to view.
      </p>
      <Link
        href="/messages"
        className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Back to messages
      </Link>
    </div>
  )

  if (!Number.isFinite(statusId)) return expired

  const [row] = await db.select().from(statusUpdate).where(eq(statusUpdate.id, statusId)).limit(1)
  if (!row || row.expiresAt.getTime() <= Date.now()) return expired

  const group = await getActiveStatusForUser(row.userId)
  if (!group) return expired

  const itemIndex = group.items.findIndex((it) => it.id === statusId)
  if (itemIndex < 0) return expired

  const currentUser = await getCurrentUser()

  return <StatusReplay group={group} startItemIndex={itemIndex} currentUser={currentUser} />
}
