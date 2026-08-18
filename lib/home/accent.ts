import type { CSSProperties } from "react"
import type { HomeView } from "./types"

// Default accent when an organisation hasn't chosen one — the Frequency accent,
// tuned to the brighter, more vibrant amber used across the accent palette.
export const DEFAULT_HOME_ACCENT = "#FF9A1F"

/**
 * Returns an inline style exposing the Home's accent colour as the
 * `--home-accent` custom property, so descendants can tint themselves with the
 * organisation's colour (e.g. `style={{ backgroundColor: "var(--home-accent)" }}`
 * or Tailwind arbitrary values). Falls back to the Frequency accent.
 *
 * Using a CSS variable (rather than hard-coding the hex everywhere) keeps the
 * organisation's colour as the single source of truth and lets us layer
 * `color-mix()` tints for hovers/surfaces.
 */
export function homeAccentStyle(home: Pick<HomeView, "accentColor">): CSSProperties {
  const accent = normalizeHex(home.accentColor) ?? DEFAULT_HOME_ACCENT
  return { ["--home-accent" as string]: accent }
}

/** Validates a #rgb / #rrggbb hex string; returns null if malformed. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : null
}
