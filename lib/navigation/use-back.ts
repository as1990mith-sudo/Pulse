"use client"

import { useCallback, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { bumpNavDepth, getNavDepth } from "./history-key"

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
    if (getNavDepth() > 0) {
      bumpNavDepth(-1)
      router.back()
    } else {
      router.replace(fallbackHref)
    }
  }, [router, fallbackHref])
}

/**
 * Counts in-app navigations so `useBack` can tell "went somewhere here" from
 * "arrived cold from outside".
 *
 * Mounted once, app-wide. Every pathname change after the first is a forward
 * navigation (+1); a popstate is the user going back (-1).
 */
export function useNavDepthTracking() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === "undefined") return
    // The first pathname seen in a session is the entry point, not a navigation,
    // so it must not count as something to go back to.
    const isFirst = window.sessionStorage?.getItem("freq:nav-seen") === null
    if (isFirst) {
      try {
        window.sessionStorage.setItem("freq:nav-seen", "1")
      } catch {
        /* private mode */
      }
      return
    }
    bumpNavDepth(1)
  }, [pathname])

  useEffect(() => {
    if (typeof window === "undefined") return
    // Back/Forward performed with the device or browser control rather than our
    // button still has to keep the counter honest.
    const onPop = () => bumpNavDepth(-1)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
}
