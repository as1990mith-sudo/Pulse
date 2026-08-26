"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { HomeMark } from "@/components/home/home-mark"

/**
 * The full-screen transition shown while the active Home is being swapped.
 *
 * Switching Home re-resolves everything at once — feed, staff, theme, Articles,
 * Library — so without a cover the screen visibly rebuilds in pieces and reads
 * as a glitch. This holds a calm veil over that moment and puts the DESTINATION
 * Home's own mark and name front and centre, so the switch feels like walking
 * into that Home rather than waiting on a spinner.
 *
 * It is deliberately keyed on the target Home: the accent ring is that Home's
 * colour, so arriving somewhere new looks different from arriving home.
 */
export function HomeSwitchOverlay({
  home,
}: {
  /** The Home being switched TO, or null when no switch is in flight. */
  home: { name: string; logo: string | null; initials: string; accent: string } | null
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted || !home) return null

  return createPortal(
    <div
      className="home-switch-veil fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background/80 backdrop-blur-xl"
      role="status"
      aria-live="polite"
      aria-label={`Switching to ${home.name}`}
    >
      <div className="relative flex items-center justify-center">
        {/* Accent ring pulsing outward, tinted with the Home's own colour. */}
        <span
          aria-hidden="true"
          className={`home-switch-ring absolute size-24 rounded-3xl ${home.accent} opacity-40`}
        />
        <span className="home-switch-mark relative">
          <HomeMark
            name={home.name}
            logo={home.logo}
            initials={home.initials}
            color={home.accent}
            rounded="rounded-3xl"
            className="size-24 shadow-floating"
            labelled
          />
        </span>
      </div>

      <div className="home-switch-label flex flex-col items-center gap-1.5 px-8 text-center">
        <span className="font-display text-xl font-semibold text-balance text-foreground">{home.name}</span>
        <span className="text-sm text-muted-foreground">Entering your Home</span>
      </div>
    </div>,
    document.body,
  )
}
