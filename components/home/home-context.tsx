"use client"

import { createContext, useCallback, useContext, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { setActiveHome } from "@/app/actions/home"
import { haptic } from "@/lib/haptics"
import { isHomeAdminRole, type HomeRole } from "@/lib/home/roles"

/**
 * Client-safe summary of the viewer's active Home context. Populated once on the
 * server (from `getActiveHomeContext`) and threaded through the tree so any
 * client component — the header badge, the My Homes switcher — can read which
 * Home is currently active without re-fetching.
 */
export type ActiveHomeSummary = {
  handle: string
  name: string
  logo: string | null
  initials: string
  accent: string
  role: HomeRole
  memberCount: number
} | null

type HomeContextValue = {
  activeHome: ActiveHomeSummary
  /** True while a Home switch is being persisted + the router refreshes. */
  switching: boolean
  /** Persist the active Home and refresh so every scoped surface re-resolves. */
  switchHome: (handle: string) => void
  /** Whether the viewer can administer the active Home. */
  isAdmin: boolean
}

const HomeContext = createContext<HomeContextValue>({
  activeHome: null,
  switching: false,
  switchHome: () => {},
  isAdmin: false,
})

export function useHomeContext() {
  return useContext(HomeContext)
}

export function HomeContextProvider({
  initialActiveHome,
  children,
}: {
  initialActiveHome: ActiveHomeSummary
  children: React.ReactNode
}) {
  const router = useRouter()
  // Read the prop directly rather than seeding state from it. `useState` captures
  // only the FIRST value, so after a switch (`router.refresh()` re-renders this
  // provider with the new Home) the context kept serving the previous Home — the
  // header badge and any `isAdmin` check stayed on the old organisation until a
  // full page reload.
  const activeHome = initialActiveHome
  const [pending, startTransition] = useTransition()
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

  const switchHome = useCallback(
    (handle: string) => {
      if (handle === activeHome?.handle) return
      haptic("light")
      setSwitchingTo(handle)
      startTransition(async () => {
        try {
          await setActiveHome(handle)
          router.refresh()
        } finally {
          setSwitchingTo(null)
        }
      })
    },
    [activeHome?.handle, router],
  )

  const isAdmin = isHomeAdminRole(activeHome?.role)

  return (
    <HomeContext.Provider
      value={{ activeHome, switching: pending || switchingTo !== null, switchHome, isAdmin }}
    >
      {children}
    </HomeContext.Provider>
  )
}
