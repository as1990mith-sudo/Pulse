import type { CSSProperties } from "react"

/**
 * Host-selectable immersive studio themes. Each theme restyles the *entire*
 * live room — base background, drifting aurora, and accent (buttons, follow,
 * active states) — for both the host console and every listener. It works by
 * overriding a handful of CSS variables on the live root:
 *  - `--live-bg`      the full-screen base background (a gradient)
 *  - `--primary` / `--primary-foreground` / `--ring`  the accent
 *  - `--live-accent`  a secondary hue the aurora blends in
 * The aurora overlay already reads `--primary`, so retinting it is automatic.
 */
export type LiveThemeId = "default" | "midnight" | "ocean" | "sanctuary" | "ember" | "rose"

export type LiveTheme = {
  id: LiveThemeId
  name: string
  description: string
  background: string
  primary: string
  primaryForeground: string
  accent: string
  // Two-stop swatch shown in the picker chip.
  swatch: [string, string]
}

export const LIVE_THEMES: LiveTheme[] = [
  {
    id: "default",
    name: "Midnight Amber",
    description: "The classic dark room with a warm amber glow.",
    background: "linear-gradient(160deg, oklch(0.2 0.02 60), oklch(0.15 0.006 285) 55%, oklch(0.12 0.006 285))",
    primary: "oklch(0.72 0.18 55)",
    primaryForeground: "oklch(0.99 0.005 60)",
    accent: "oklch(0.66 0.21 24)",
    swatch: ["oklch(0.72 0.18 55)", "oklch(0.15 0.006 285)"],
  },
  {
    id: "midnight",
    name: "Deep Indigo",
    description: "A cool indigo-to-blue night sky.",
    background: "linear-gradient(160deg, oklch(0.26 0.08 280), oklch(0.16 0.05 265) 55%, oklch(0.12 0.03 260))",
    primary: "oklch(0.7 0.16 255)",
    primaryForeground: "oklch(0.99 0.005 260)",
    accent: "oklch(0.72 0.13 210)",
    swatch: ["oklch(0.7 0.16 255)", "oklch(0.16 0.05 265)"],
  },
  {
    id: "ocean",
    name: "Tidewater",
    description: "Calm teal and cyan over deep water.",
    background: "linear-gradient(160deg, oklch(0.24 0.06 200), oklch(0.16 0.04 205) 55%, oklch(0.12 0.03 210))",
    primary: "oklch(0.72 0.13 195)",
    primaryForeground: "oklch(0.99 0.005 200)",
    accent: "oklch(0.74 0.12 165)",
    swatch: ["oklch(0.72 0.13 195)", "oklch(0.16 0.04 205)"],
  },
  {
    id: "sanctuary",
    name: "Sanctuary Gold",
    description: "Reverent gold over warm candlelit shadow.",
    background: "linear-gradient(160deg, oklch(0.26 0.04 70), oklch(0.17 0.025 60) 55%, oklch(0.13 0.02 50))",
    primary: "oklch(0.8 0.14 80)",
    primaryForeground: "oklch(0.2 0.03 70)",
    accent: "oklch(0.7 0.16 45)",
    swatch: ["oklch(0.8 0.14 80)", "oklch(0.17 0.025 60)"],
  },
  {
    id: "ember",
    name: "Ember",
    description: "Glowing coals — fiery red over near-black.",
    background: "linear-gradient(160deg, oklch(0.24 0.07 30), oklch(0.15 0.03 25) 55%, oklch(0.11 0.02 20))",
    primary: "oklch(0.66 0.21 28)",
    primaryForeground: "oklch(0.99 0.005 30)",
    accent: "oklch(0.76 0.16 55)",
    swatch: ["oklch(0.66 0.21 28)", "oklch(0.15 0.03 25)"],
  },
  {
    id: "rose",
    name: "Rose Quartz",
    description: "Soft rose and magenta over dusk.",
    background: "linear-gradient(160deg, oklch(0.26 0.07 350), oklch(0.16 0.04 350) 55%, oklch(0.12 0.03 345))",
    primary: "oklch(0.72 0.17 350)",
    primaryForeground: "oklch(0.99 0.005 350)",
    accent: "oklch(0.74 0.15 20)",
    swatch: ["oklch(0.72 0.17 350)", "oklch(0.16 0.04 350)"],
  },
]

export const DEFAULT_LIVE_THEME = LIVE_THEMES[0]

export function getLiveTheme(id: string | null | undefined): LiveTheme {
  return LIVE_THEMES.find((t) => t.id === id) ?? DEFAULT_LIVE_THEME
}

/**
 * The inline style to spread onto a live room root. Sets the base background
 * and overrides the accent CSS variables so all `bg-primary` / `text-primary`
 * descendants and the aurora retint to the chosen theme.
 */
export function liveThemeStyle(id: string | null | undefined): CSSProperties {
  const t = getLiveTheme(id)
  return {
    background: t.background,
    // CSS custom properties (cast for TS).
    ["--live-bg" as string]: t.background,
    ["--live-accent" as string]: t.accent,
    ["--primary" as string]: t.primary,
    ["--primary-foreground" as string]: t.primaryForeground,
    ["--ring" as string]: t.primary,
  } as CSSProperties
}
