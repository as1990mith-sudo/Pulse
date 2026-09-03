"use client"

import { useEffect } from "react"

/**
 * iOS-safe body scroll lock for full-screen overlays.
 *
 * The usual `document.body.style.overflow = "hidden"` does NOT stop touch
 * scrolling on iOS Safari — the page *behind* an overlay keeps scrolling, so the
 * overlay feels "stuck" and the scroll happens on the screen behind (the exact
 * reported bug on the Live/Catalogue screen). Pinning the body with
 * `position: fixed`, offset by the current scroll position, is the reliable
 * cross-browser lock. The scroll offset is captured on lock and restored on
 * unlock so the page never jumps back to the top when the overlay closes.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (typeof document === "undefined") return

    const body = document.body
    const scrollY = window.scrollY

    // Remember what we're overriding so unrelated inline styles survive.
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }

    body.style.position = "fixed"
    body.style.top = `-${scrollY}px`
    body.style.left = "0"
    body.style.right = "0"
    body.style.width = "100%"
    // Keep overflow hidden too for desktop browsers where it works.
    body.style.overflow = "hidden"

    return () => {
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      body.style.overflow = prev.overflow
      // Restore the scroll position the lock froze.
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
