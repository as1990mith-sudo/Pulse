"use client"

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"

/* -------------------------------------------------------------------------- *
 *  Auto-hiding global chrome for immersive chat interfaces.
 *
 *  A tiny external store shared between the inner chat scroll containers
 *  (Chatroom, Community Help, Dream Interpretation) and the global SiteHeader.
 *  Scrolling down through a conversation hides the global header; scrolling
 *  back up reveals it — exactly like Instagram / Telegram / WhatsApp.
 * -------------------------------------------------------------------------- */

let hidden = false
const listeners = new Set<() => void>()

export function setChatChromeHidden(next: boolean) {
  if (hidden === next) return
  hidden = next
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Read the current hidden state (SSR-safe: always visible on the server). */
export function useChatChromeHidden() {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false,
  )
}

// Tunable thresholds for a fluid, flicker-free feel.
const HIDE_DELTA = 6 // px of downward travel before hiding
const REVEAL_DELTA = 10 // px of upward travel before revealing (direction-change debounce)
const TOP_ZONE = 8 // always reveal within this many px of the top

/**
 * Returns an `onScroll` handler to attach to a chat's inner scroll container.
 * It measures scroll direction (rAF-throttled) and drives the shared store,
 * and always restores the header when the view unmounts so other pages are
 * unaffected. The user's scroll position is never mutated.
 */
export function useAutoHideChatChrome() {
  const lastY = useRef(0)
  const frame = useRef(0)

  // Reveal the header again whenever we leave the chat view.
  useEffect(() => {
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      setChatChromeHidden(false)
    }
  }, [])

  return useCallback((event: React.UIEvent<HTMLElement>) => {
    // Capture synchronously — the event target is not valid inside rAF.
    const y = event.currentTarget.scrollTop
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const delta = y - lastY.current

      // Near the very top, the header is always shown.
      if (y <= TOP_ZONE) {
        setChatChromeHidden(false)
        lastY.current = y
        return
      }

      if (delta > HIDE_DELTA) {
        // Scrolling down — slide the global header away.
        setChatChromeHidden(true)
        lastY.current = y
      } else if (delta < -REVEAL_DELTA) {
        // Scrolling up past the threshold — bring it back.
        setChatChromeHidden(false)
        lastY.current = y
      }
      // Small jitters within the deadband are ignored to prevent flicker.
    })
  }, [])
}
