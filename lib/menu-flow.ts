"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

/**
 * Tracks a "menu navigation flow": the page the user was on *before* they opened
 * the side menu and tapped an item. While the flow is active, menu-visited pages
 * show a Back arrow (steps back through the pages visited during the flow) and a
 * Close icon (jumps straight back to where the flow started). The flow ends
 * automatically once the user returns to that origin page.
 *
 * State lives in sessionStorage so it survives client navigations without
 * persisting long-term.
 */
const MENU_FLOW_KEY = "frequency:menu-origin"
// Set when the user taps Close on a menu-opened page: it asks the origin page to
// re-open the side menu drawer as soon as it loads, so Close returns them to the
// menu rather than just the page they started from. We store the *target* path
// (where the flow started) so ONLY that page consumes the flag — otherwise the
// current page can briefly re-mount its menu and eat the flag before the
// destination ever loads, and the drawer never reopens where it should.
const MENU_REOPEN_KEY = "frequency:menu-reopen"

export function requestMenuReopen(targetPath: string) {
  try {
    sessionStorage.setItem(MENU_REOPEN_KEY, targetPath)
  } catch {
    /* no-op */
  }
}

/**
 * If a reopen was requested for `currentPath`, clears the flag and returns true.
 * Pages whose path doesn't match leave the flag intact so the intended
 * destination is the one that actually reopens the drawer.
 */
export function consumeMenuReopen(currentPath: string): boolean {
  try {
    const target = sessionStorage.getItem(MENU_REOPEN_KEY)
    if (target && target === currentPath) {
      sessionStorage.removeItem(MENU_REOPEN_KEY)
      return true
    }
    return false
  } catch {
    return false
  }
}

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

  const back = useCallback(() => {
    router.back()
  }, [router])

  const close = useCallback(() => {
    const target = getMenuOrigin()
    clearMenuFlow()
    setOrigin(null)
    // Ask the destination page (the origin where the flow started) to re-open
    // the side menu drawer so Close returns the user to the menu, not just the
    // page the flow started from. Tagging the flag with the target path ensures
    // only that page consumes it — not the current page as it unmounts.
    if (target) {
      requestMenuReopen(target)
      router.push(target)
    } else {
      router.back()
    }
  }, [router])

  return { active, back, close }
}
