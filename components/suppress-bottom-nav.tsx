"use client"

import { useEffect } from "react"

/**
 * Mount inside any server-rendered surface that must hide the global BottomNav
 * without a matching immersive route (e.g. the signed-out signup chooser at
 * `/`, which is otherwise the members-only Home feed). It dispatches the
 * `nav:suppress` event the BottomNav listens for while mounted, and clears it on
 * unmount so navigating away restores the bar. Renders nothing.
 */
export function SuppressBottomNav() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("nav:suppress", { detail: true }))
    return () => {
      window.dispatchEvent(new CustomEvent("nav:suppress", { detail: false }))
    }
  }, [])
  return null
}
