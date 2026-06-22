"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

// Skins are a theming axis independent of light/dark/mid/transparent. A skin
// only re-tints the accent + status ring (see the [data-skin] blocks in
// globals.css); it is stored on <html data-skin> and persisted to localStorage.
export const SKINS = [
  { value: "orange", label: "Orange" },
  { value: "green", label: "Green" },
  { value: "aurora", label: "Aurora" },
] as const

export type Skin = (typeof SKINS)[number]["value"]
const SKIN_VALUES = SKINS.map((s) => s.value) as readonly string[]
export const SKIN_STORAGE_KEY = "frequency-skin"

// Inline script injected before paint so the chosen skin is applied without a
// flash of the default accent. Kept in sync with SKIN_STORAGE_KEY above.
export const SKIN_INIT_SCRIPT = `try{var s=localStorage.getItem('${SKIN_STORAGE_KEY}');if(!s||['orange','green','aurora'].indexOf(s)<0)s='orange';document.documentElement.dataset.skin=s;}catch(e){document.documentElement.dataset.skin='orange';}`

type SkinContextValue = { skin: Skin; setSkin: (skin: Skin) => void; mounted: boolean }
const SkinContext = createContext<SkinContextValue | null>(null)

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<Skin>("orange")
  const [mounted, setMounted] = useState(false)

  // Hydrate from whatever the init script already applied to <html>.
  useEffect(() => {
    const current = document.documentElement.dataset.skin
    const stored = (current && SKIN_VALUES.includes(current) ? current : localStorage.getItem(SKIN_STORAGE_KEY)) as
      | Skin
      | null
    if (stored && SKIN_VALUES.includes(stored)) setSkinState(stored)
    setMounted(true)
  }, [])

  function setSkin(next: Skin) {
    setSkinState(next)
    document.documentElement.dataset.skin = next
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, next)
    } catch {
      // Ignore storage failures (private mode, etc.) — skin still applies live.
    }
  }

  return <SkinContext.Provider value={{ skin, setSkin, mounted }}>{children}</SkinContext.Provider>
}

export function useSkin() {
  const ctx = useContext(SkinContext)
  if (!ctx) throw new Error("useSkin must be used within a SkinProvider")
  return ctx
}
