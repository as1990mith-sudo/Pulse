"use client"

import { useNavDepthTracking } from "@/lib/navigation/use-back"

/**
 * Renders nothing; exists so the app-wide navigation-depth tracking runs from the
 * root layout. Mounted once there, it observes every route change in the session
 * so any Back control can tell "the user navigated here from inside the app" from
 * "the user arrived cold on a deep link".
 */
export function NavHistoryTracker() {
  useNavDepthTracking()
  return null
}
