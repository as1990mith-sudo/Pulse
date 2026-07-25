"use client"

import { useEffect } from "react"
import { heartbeat } from "@/app/actions/presence"

// How often to report "I'm still here" while the tab is visible. The server
// counts a user online for 60s after their last ping, so 25s leaves comfortable
// headroom for one dropped request without flapping the count.
const HEARTBEAT_INTERVAL_MS = 25_000

/**
 * Fire-and-forget global presence ping. Records the signed-in user as online
 * while their tab is actually visible, powering the admin "Online now" figure.
 * The server action no-ops for signed-out visitors, so this is safe to mount
 * app-wide. Pings pause when the tab is hidden and resume (with an immediate
 * ping) when it becomes visible again, so the count reflects real activity.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false
    const ping = () => {
      if (cancelled) return
      if (document.visibilityState !== "visible") return
      void heartbeat()
    }

    ping()
    const id = window.setInterval(ping, HEARTBEAT_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") ping()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return null
}
