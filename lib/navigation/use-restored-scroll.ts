"use client"

import { useEffect, useRef } from "react"

import { getHistoryKey } from "./history-key"

const STORE_PREFIX = "freq:scroll:"

/**
 * Remembers and restores a scroll position per history entry.
 *
 * The browser's own `scrollRestoration` is not enough here. It captures the
 * offset for a document that was fully laid out, but Frequency's lists arrive
 * after mount (SWR fetches, then images resolving and changing row heights), so
 * by the time the content exists the browser has long since given up and the
 * user lands at the top of the feed they were half-way down.
 *
 * So: save on scroll (throttled via rAF), and on the way back keep re-applying
 * the target as the page grows until it sticks — or until the user scrolls, whose
 * intent always wins.
 *
 * @param scopeId Distinguishes independent scrollers on one screen (e.g. per tab),
 *                so switching tabs doesn't apply tab A's offset to tab B.
 * @param ref     The scrolling element. Omit for page-level (window) scrolling.
 * @param enabled Pass false to opt a screen out entirely.
 */
export function useRestoredScroll(
  scopeId: string,
  ref?: React.RefObject<HTMLElement | null>,
  enabled = true,
) {
  // Read through refs so a re-created ref object doesn't restart the effect and
  // re-trigger a restore mid-session.
  const refRef = useRef(ref)
  refRef.current = ref

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    const storageKey = `${STORE_PREFIX}${getHistoryKey()}:${scopeId}`
    const target = refRef.current?.current ?? null
    const read = () => (target ? target.scrollTop : window.scrollY)
    const write = (top: number) =>
      target ? target.scrollTo({ top, behavior: "instant" }) : window.scrollTo({ top, behavior: "instant" })

    // ---- restore ------------------------------------------------------------
    const savedRaw = window.sessionStorage?.getItem(storageKey)
    const saved = savedRaw ? Number.parseInt(savedRaw, 10) : 0
    let cancelled = false
    let frame = 0

    if (saved > 0) {
      const deadline = Date.now() + 3000
      const attempt = () => {
        if (cancelled) return
        write(saved)
        // Stop as soon as the position is actually reachable — otherwise keep
        // trying while late content extends the scroll height. Verified against
        // the real feed, where the list is still growing several frames in.
        const reached = Math.abs(read() - saved) <= 2
        if (!reached && Date.now() < deadline) frame = requestAnimationFrame(attempt)
      }
      frame = requestAnimationFrame(attempt)

      // Any deliberate scroll or key press abandons the restore, so we never
      // fight the user for control of the viewport.
      const abort = () => {
        cancelled = true
        cancelAnimationFrame(frame)
      }
      window.addEventListener("wheel", abort, { passive: true, once: true })
      window.addEventListener("touchstart", abort, { passive: true, once: true })
      window.addEventListener("keydown", abort, { once: true })
    }

    // ---- save ---------------------------------------------------------------
    let pending = 0
    const onScroll = () => {
      if (pending) return
      pending = requestAnimationFrame(() => {
        pending = 0
        try {
          window.sessionStorage?.setItem(storageKey, String(Math.round(read())))
        } catch {
          // Storage full or blocked (private mode): restoration silently
          // degrades rather than throwing inside a scroll handler.
        }
      })
    }
    const scroller: HTMLElement | Window = target ?? window
    scroller.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      if (pending) cancelAnimationFrame(pending)
      scroller.removeEventListener("scroll", onScroll)
    }
  }, [scopeId, enabled])
}
