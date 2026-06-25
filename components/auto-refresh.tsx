"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

/**
 * App-wide live data keeper. Server Components render the feed, adverts, live
 * status, profiles, etc., so calling `router.refresh()` re-fetches all of that
 * data in the background and patches the UI in place — without a full reload
 * and without losing client state (scroll position, the persistent live room,
 * the episode player, form inputs, open dialogs).
 *
 * It refreshes on a steady interval while the tab is visible, and immediately
 * when the user returns to the tab or the network reconnects, so new posts,
 * adverts and live sessions appear (and ended ones disappear) automatically —
 * users never have to pull-to-refresh or reload.
 */
const REFRESH_INTERVAL_MS = 20_000

export function AutoRefresh() {
  const router = useRouter()
  // Throttle so a focus/visibility/online burst can't trigger many refreshes
  // back-to-back (they'd all hit the server at once).
  const lastRefresh = useRef(0)

  useEffect(() => {
    const refresh = () => {
      const now = Date.now()
      if (now - lastRefresh.current < 4_000) return
      lastRefresh.current = now
      router.refresh()
    }

    // Steady background refresh — only while the tab is actually visible to
    // avoid pointless work (and battery drain) on backgrounded tabs.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh()
    }, REFRESH_INTERVAL_MS)

    // Returning to the tab (or reconnecting) should show fresh data right away.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    window.addEventListener("online", refresh)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
      window.removeEventListener("online", refresh)
    }
  }, [router])

  return null
}
