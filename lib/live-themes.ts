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
export type LiveThemeId =
  | "default"
  | "midnight"
  | "ocean"
  | "verdant-valley"
  | "city-lights"
  | "starfall"

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
  // Optional full-bleed photo background. When set, the room renders this image
  // (behind a legibility scrim) instead of the flat gradient, and the aurora
  // glow is dimmed so the photo stays the focal point. `background` above is
  // kept as a graceful fallback while the image loads / if it 404s.
  backgroundImage?: string
}

export const LIVE_THEMES: LiveTheme[] = [
  {
    id: "default",
    name: "Midnight Amber",
    description: "The classic dark room with a warm amber glow.",
    background: "linear-gradient(160deg, oklch(0.12 0.006 285), oklch(0.15 0.006 285) 45%, oklch(0.2 0.02 60))",
    primary: "oklch(0.72 0.18 55)",
    primaryForeground: "oklch(0.99 0.005 60)",
    accent: "oklch(0.66 0.21 24)",
    swatch: ["oklch(0.72 0.18 55)", "oklch(0.15 0.006 285)"],
  },
  {
    id: "midnight",
    name: "Deep Indigo",
    description: "A cool indigo-to-blue night sky.",
    background: "linear-gradient(160deg, oklch(0.12 0.03 260), oklch(0.16 0.05 265) 45%, oklch(0.26 0.08 280))",
    primary: "oklch(0.7 0.16 255)",
    primaryForeground: "oklch(0.99 0.005 260)",
    accent: "oklch(0.72 0.13 210)",
    swatch: ["oklch(0.7 0.16 255)", "oklch(0.16 0.05 265)"],
  },
  {
    id: "ocean",
    name: "Tidewater",
    description: "Calm teal and cyan over deep water.",
    background: "linear-gradient(160deg, oklch(0.12 0.03 210), oklch(0.16 0.04 205) 45%, oklch(0.24 0.06 200))",
    primary: "oklch(0.72 0.13 195)",
    primaryForeground: "oklch(0.99 0.005 200)",
    accent: "oklch(0.74 0.12 165)",
    swatch: ["oklch(0.72 0.13 195)", "oklch(0.16 0.04 205)"],
  },
  // ── Photo themes ─────────────────────────────────────────────────────────
  // These render a full-bleed image. Their accent (primary/accent) is curated
  // to harmonize with the photo so buttons and the dimmed aurora still feel
  // part of the scene. `background` is the fallback gradient shown behind the
  // image while it loads.
  {
    id: "verdant-valley",
    name: "Verdant Valley",
    description: "Lush green hills in soft morning mist.",
    background: "linear-gradient(160deg, oklch(0.13 0.03 150), oklch(0.17 0.04 145) 45%, oklch(0.24 0.06 140))",
    primary: "oklch(0.74 0.14 150)",
    primaryForeground: "oklch(0.15 0.03 150)",
    accent: "oklch(0.78 0.13 130)",
    swatch: ["oklch(0.74 0.14 150)", "oklch(0.17 0.04 145)"],
    backgroundImage: "/live-themes/verdant-valley.png",
  },
  {
    id: "city-lights",
    name: "City Lights",
    description: "Glass skyscrapers at blue hour.",
    background: "linear-gradient(160deg, oklch(0.12 0.03 250), oklch(0.16 0.04 240) 45%, oklch(0.24 0.06 225))",
    primary: "oklch(0.74 0.13 230)",
    primaryForeground: "oklch(0.99 0.005 240)",
    accent: "oklch(0.75 0.12 200)",
    swatch: ["oklch(0.74 0.13 230)", "oklch(0.16 0.04 240)"],
    backgroundImage: "/live-themes/city-lights.png",
  },
  {
    id: "starfall",
    name: "Starfall",
    description: "The Milky Way over a dark horizon.",
    background: "linear-gradient(160deg, oklch(0.11 0.04 290), oklch(0.15 0.06 285) 45%, oklch(0.22 0.08 280))",
    primary: "oklch(0.74 0.14 300)",
    primaryForeground: "oklch(0.99 0.005 300)",
    accent: "oklch(0.72 0.13 265)",
    swatch: ["oklch(0.74 0.14 300)", "oklch(0.15 0.06 285)"],
    backgroundImage: "/live-themes/starfall.png",
  },
]

export const DEFAULT_LIVE_THEME = LIVE_THEMES[0]

export function getLiveTheme(id: string | null | undefined): LiveTheme {
  return LIVE_THEMES.find((t) => t.id === id) ?? DEFAULT_LIVE_THEME
}

/**
 * Resolves the photo URL a theme should render, or null for flat gradient
 * themes. Handles two cases:
 *  - a preset photo theme (returns its bundled `backgroundImage`), and
 *  - a custom host upload, where the stored theme value IS the image URL
 *    (a blob/https/data URL). Custom uploads have no preset entry, so we detect
 *    them by shape.
 */
export function liveThemeImageUrl(id: string | null | undefined): string | null {
  const preset = LIVE_THEMES.find((t) => t.id === id)
  if (preset?.backgroundImage) return preset.backgroundImage
  if (typeof id === "string" && /^(https?:|blob:|data:)/.test(id)) return id
  return null
}

/** True when the active theme renders a full-bleed photo (preset or custom). */
export function isLiveImageTheme(id: string | null | undefined): boolean {
  return liveThemeImageUrl(id) !== null
}

// Legibility scrim layered over photo backgrounds: light in the middle so the
// image reads, darker at top/bottom where the header and controls sit.
const PHOTO_SCRIM =
  "linear-gradient(180deg, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.25) 32%, rgba(9,9,11,0.30) 60%, rgba(9,9,11,0.80) 100%)"

/**
 * The inline style to spread onto a live room root. Sets the base background
 * and overrides the accent CSS variables so all `bg-primary` / `text-primary`
 * descendants and the aurora retint to the chosen theme.
 *
 * For photo themes it stacks a scrim over the cover-fitted image and dims the
 * aurora via `--live-aurora-opacity` so the glow doesn't wash out the picture.
 * Gradient themes omit that variable, so each aurora layer keeps its own
 * default opacity untouched.
 */
export function liveThemeStyle(id: string | null | undefined): CSSProperties {
  const imageUrl = liveThemeImageUrl(id)
  if (imageUrl) {
    // Accent comes from the matching preset, or the default (amber) for a
    // custom upload that has no palette of its own.
    const t = getLiveTheme(id)
    const cssUrl = `url("${imageUrl.replace(/"/g, '\\"')}")`
    const background = `${PHOTO_SCRIM}, ${cssUrl} center / cover no-repeat`
    return {
      background,
      backgroundColor: "oklch(0.11 0.005 285)",
      ["--live-bg" as string]: background,
      ["--live-accent" as string]: t.accent,
      ["--primary" as string]: t.primary,
      ["--primary-foreground" as string]: t.primaryForeground,
      ["--ring" as string]: t.primary,
      ["--live-aurora-opacity" as string]: "0.3",
    } as CSSProperties
  }

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
