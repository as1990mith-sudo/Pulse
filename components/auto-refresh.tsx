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
 * It refreshes immediately when the user returns to the tab, refocuses the
 * window, or the network reconnects — so new posts, adverts and live sessions
 * are up to date whenever the user is actually looking at the app.
 *
 * It deliberately does NOT refresh on a steady timer. A periodic
 * `router.refresh()` re-renders the entire Server Component tree in place every
 * few seconds, and that repaint is visible as an intermittent screen flicker
 * (and reloads full-bleed images) while the user is simply reading. The truly
 * live surfaces — the feed, chat, live rooms, DMs and notifications — already
 * poll their own data client-side via SWR, so a constant full-app refresh is
 * redundant with those and only adds the flicker. Refreshing on
 * focus/visibility/reconnect keeps data fresh without the periodic repaint.
 */
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

    // Returning to the tab (or reconnecting) should show fresh data right away —
    // except on the scroll-heavy reading surfaces that already poll their own
    // data via SWR. There, a router.refresh() re-renders the whole Server
    // Component tree and remounts the media inside it, which the reader sees as
    // the feed lurching or losing their place. On mobile this fired constantly:
    // opening a video full screen, dismissing a sheet or the address bar
    // reclaiming focus all count as a focus event. Those surfaces stay fresh on
    // their own, so the full-app refresh is redundant there.
    const SELF_POLLING = ["/feed", "/chatrooms"]
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (SELF_POLLING.some((p) => window.location.pathname.startsWith(p))) return
      refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    window.addEventListener("online", refresh)

    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
      window.removeEventListener("online", refresh)
    }
  }, [router])

  return null
}
