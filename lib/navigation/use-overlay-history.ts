"use client"

import { useEffect, useRef } from "react"

import { bumpNavDepth } from "./history-key"

/**
 * Gives a full-screen overlay, modal, bottom sheet or media viewer its own
 * history entry, so the device Back button / iOS swipe-back closes THAT overlay
 * and returns to the screen underneath — rather than navigating the whole app
 * away and leaving the user to find their place again.
 *
 * Nesting works without any extra bookkeeping: each open overlay owns one entry,
 * so a media viewer opened from inside a conversation unwinds one layer per Back
 * (viewer → conversation → list).
 *
 * This replaces several near-identical hand-rolled pushState/popstate blocks that
 * had drifted apart — some closed on Back, some left an orphan entry that made
 * the next Back a no-op, requiring two presses to leave.
 *
 * @param open    Whether the overlay is currently shown.
 * @param onClose Invoked when Back dismisses it. Should only update state — do
 *                not call `history.back()` from here, or the two will fight.
 * @param id      Debug label, also used to keep sibling markers distinguishable.
 */
export function useOverlayHistory(open: boolean, onClose: () => void, id = "overlay") {
  // Held in a ref so a new inline closure on every render doesn't tear down and
  // rebuild the history entry, which would corrupt the stack.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open || typeof window === "undefined") return

    const token = `${id}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    // Spread the existing state so Next.js router internals survive.
    window.history.pushState({ ...(window.history.state ?? {}), __freqOverlay: token }, "")
    // An overlay adds a real entry without changing the pathname, so the depth
    // tracker would never count it — but WOULD count the matching popstate on
    // close, drifting the count down and making Back fall back to the href too
    // early. Incrementing here keeps the two sides balanced.
    bumpNavDepth(1)

    // Tracks whether OUR entry is still on the stack, so cleanup can tell a
    // Back-driven close (entry already gone) from a programmatic one (still there).
    let ours = true

    const onPop = () => {
      ours = false
      onCloseRef.current()
    }
    window.addEventListener("popstate", onPop)

    return () => {
      window.removeEventListener("popstate", onPop)
      // Closed from within the UI (an X button, a route change) while our marker
      // is still current: pop it, or it would linger and swallow the user's next
      // Back press as a no-op.
      if (ours && (window.history.state as { __freqOverlay?: string } | null)?.__freqOverlay === token) {
        window.history.back()
      }
    }
  }, [open, id])
}
