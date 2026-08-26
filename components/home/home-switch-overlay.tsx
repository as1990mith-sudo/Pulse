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
        {/* Accent ring pulsing outward, tinted with the Home's own colour.
            `accent` is a raw CSS colour (e.g. "#f97316"), not a utility class,
            so it has to go through `style` — as a className it renders nothing. */}
        <span
          aria-hidden="true"
          className="home-switch-ring absolute size-24 rounded-3xl"
          style={{ backgroundColor: home.accent }}
        />
        <span className="home-switch-mark relative">
          <HomeMark
            name={home.name}
            logo={home.logo}
            initials={home.initials}
            color={home.accent}
            rounded="rounded-3xl"
            // HomeMark's default type size is tuned for a ~20px mark, so the
            // initials need scaling up explicitly at this size or they read as a
            // speck in the middle of the tile.
            className="size-24 text-2xl shadow-floating"
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
