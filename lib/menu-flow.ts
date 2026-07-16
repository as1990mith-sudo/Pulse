"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

/**
 * Tracks a "menu navigation flow": the page the user was on *before* they opened
 * the side menu and tapped an item. While the flow is active, menu-visited pages
 * show a single Back arrow that steps one layer back through history until the
 * user reaches the page where the menu was opened. The flow ends automatically
 * once the user returns to that origin page.
 *
 * State lives in sessionStorage so it survives client navigations without
 * persisting long-term.
 */
const MENU_FLOW_KEY = "frequency:menu-origin"

export function startMenuFlow(origin: string) {
  try {
    sessionStorage.setItem(MENU_FLOW_KEY, origin)
  } catch {
    /* sessionStorage unavailable — degrade gracefully */
  }
}

export function getMenuOrigin(): string | null {
  try {
    return sessionStorage.getItem(MENU_FLOW_KEY)
  } catch {
    return null
  }
}

export function clearMenuFlow() {
  try {
    sessionStorage.removeItem(MENU_FLOW_KEY)
  } catch {
    /* no-op */
  }
}

export function useMenuFlow() {
  const pathname = usePathname()
  const router = useRouter()
  const [origin, setOrigin] = useState<string | null>(null)

  useEffect(() => {
    const stored = getMenuOrigin()
    if (stored && stored === pathname) {
      // Arrived back where the flow started — end it.
      clearMenuFlow()
      setOrigin(null)
    } else {
      setOrigin(stored)
    }
  }, [pathname])

  const active = !!origin && origin !== pathname

  // Steps one layer back through history. Repeated presses walk back through the
  // pages visited since the menu opened until the origin page is reached, at
  // which point the flow ends and the header reverts to the hamburger.
  const back = useCallback(() => {
    router.back()
  }, [router])

  return { active, back }
}
