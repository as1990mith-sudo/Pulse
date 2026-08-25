"use client"

import { useCallback, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"

import { getNavDepth, hasInAppHistory, setNavDepth } from "./history-key"

/**
 * The single Back behaviour for the whole app.
 *
 * There is exactly ONE decision here: does this session have a previous in-app
 * entry to unwind? If so, pop it — whatever it happens to be. If not (a deep
 * link, a push notification, a shared URL opened in a fresh tab) fall back to a
 * sensible parent so the user is not stranded on a dead end.
 *
 * What it deliberately does NOT do is look at the current route to decide where
 * Back should go. That per-screen guessing is what produced "Player → Posts":
 * the screen's usual entry point is not the same thing as where this particular
 * user actually came from.
 *
 * @param fallbackHref Used ONLY when there is no in-app history — never as a
 *                     substitute for it.
 */
export function useBack(fallbackHref = "/") {
  const router = useRouter()

  return useCallback(() => {
    // Not history.length: that counts other origins visited in this tab, so on a
    // deep link it is frequently already > 1 and Back would exit the app.
    if (hasInAppHistory()) {
      // Nothing to adjust: the entry we land on already carries its own depth.
      router.back()
    } else {
      router.replace(fallbackHref)
    }
  }, [router, fallbackHref])
}

/**
 * Records how deep each history entry is, so `useBack` can tell "navigated here
 * from inside the app" from "arrived cold from a link".
 *
 * Mounted once, app-wide. On each forward navigation the new entry is stamped
 * with the previous entry's depth + 1. Nothing needs to be decremented: going
 * Back restores an entry that already carries its own depth.
 */
export function useNavDepthTracking() {
  const pathname = usePathname()
  // The depth of the entry we were on before this navigation.
  const prevDepth = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const stamped = getNavDepth()
    if (prevDepth.current === null) {
      // First render of the session. If this entry is already stamped we are
      // returning to it via Back/Forward or a reload, so its depth stands; an
      // unstamped entry is a fresh entry point and stays at 0.
      prevDepth.current = stamped
      return
    }

    // A pathname change with the depth already stamped means the browser restored
    // an existing entry (Back/Forward) rather than pushing a new one.
    if (stamped > 0 && stamped !== prevDepth.current) {
      prevDepth.current = stamped
      return
    }

    const next = prevDepth.current + 1
    setNavDepth(next)
    prevDepth.current = next
  }, [pathname])
}
