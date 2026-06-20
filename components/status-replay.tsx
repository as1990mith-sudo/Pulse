"use client"

import { useRouter } from "next/navigation"
import { StatusViewer } from "@/components/status-bar"
import type { StatusGroup } from "@/app/actions/status"
import type { CurrentUser } from "@/lib/session"

/**
 * Opens a single status (linked from an inbox reply) directly in the full-screen
 * viewer, starting on the referenced item. Closing returns to the previous page.
 */
export function StatusReplay({
  group,
  startItemIndex,
  currentUser,
}: {
  group: StatusGroup
  startItemIndex: number
  currentUser: CurrentUser | null
}) {
  const router = useRouter()

  function leave() {
    if (window.history.length > 1) router.back()
    else router.push("/messages")
  }

  return (
    <StatusViewer
      groups={[group]}
      startIndex={0}
      startItemIndex={startItemIndex}
      currentUser={currentUser}
      onClose={leave}
      onDelete={leave}
    />
  )
}
