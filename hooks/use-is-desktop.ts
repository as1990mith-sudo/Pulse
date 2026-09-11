"use client"

import { useEffect, useState } from "react"

/**
 * True only on real desktop browsers — a wide viewport driven by a precise
 * pointer (a mouse), never a phone or tablet. Used to gate desktop-only
 * affordances such as screen sharing, which is unreliable or entirely absent on
 * touch devices. SSR-safe: starts `false` and resolves after mount, so the
 * control never flashes on mobile during hydration.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(min-width: 768px) and (pointer: fine)")
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isDesktop
}
