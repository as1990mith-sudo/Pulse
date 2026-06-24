"use client"

import { useEffect, useState } from "react"
import { Radio } from "lucide-react"
import { cn } from "@/lib/utils"

const LAUNCH_KEY = "freq:launched"

/**
 * Inline script injected before paint (alongside SKIN_INIT_SCRIPT). If the app
 * has already launched this browsing session, it tags <html> so the splash is
 * hidden instantly — no replay, no flash — on reloads and re-entries.
 */
export const LAUNCH_INIT_SCRIPT = `try{if(sessionStorage.getItem('${LAUNCH_KEY}')==='1')document.documentElement.classList.add('freq-launched');}catch(e){}`

/**
 * A one-time, premium boot animation shown on the very first load of a session.
 * Broadcasting rings ripple out from the brand tile, the wordmark rises in, and
 * the overlay then fades away to reveal the app. Animation is shortened for
 * reduced-motion users (the CSS also disables the keyframes themselves).
 */
export function AppLaunch() {
  const [out, setOut] = useState(false) // begin fade-out
  const [gone, setGone] = useState(false) // fully unmount

  useEffect(() => {
    // Already launched this session → remove immediately (CSS has hidden it).
    let launched = false
    try {
      launched = sessionStorage.getItem(LAUNCH_KEY) === "1"
    } catch {
      /* sessionStorage unavailable — treat as a fresh launch */
    }
    if (launched) {
      setGone(true)
      return
    }

    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    // Hold long enough for the tile + wordmark fades to fully settle.
    const hold = reduce ? 360 : 1500

    const fadeTimer = setTimeout(() => setOut(true), hold)
    const doneTimer = setTimeout(() => {
      setGone(true)
      try {
        sessionStorage.setItem(LAUNCH_KEY, "1")
        document.documentElement.classList.add("freq-launched")
      } catch {
        /* ignore storage failures */
      }
    }, hold + 760)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [])

  if (gone) return null

  return (
    <div className={cn("app-launch", out && "app-launch--out")} role="presentation" aria-hidden="true">
      <div className="app-launch__inner">
        <div className="app-launch__logo">
          <span className="app-launch__ring" />
          <span className="app-launch__ring" style={{ animationDelay: "0.55s" }} />
          <span className="app-launch__ring" style={{ animationDelay: "1.1s" }} />
          <span className="app-launch__tile">
            <Radio />
          </span>
        </div>
        <span className="app-launch__word">Frequency</span>
      </div>
    </div>
  )
}
