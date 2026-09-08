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
  | "sunlit-leaf"
  | "evergreen"
  | "golden-lake"
  | "winter-cabin"
  | "fernlight"

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
  // Fernwood is the preset/default room look — a dense, deep-green fern canopy
  // in low light whose uniform darkness keeps overlaid text and controls
  // perfectly legible. It intentionally reuses the id "default" so brand-new
  // rooms (whose DB theme column defaults to "default") and any room already on
  // the old default adopt this photo automatically, with no data migration.
  {
    id: "default",
    name: "Fernwood",
    description: "A deep green fern canopy in low light.",
    background: "linear-gradient(160deg, oklch(0.16 0.03 150), oklch(0.2 0.04 145) 45%, oklch(0.26 0.05 140))",
    primary: "oklch(0.78 0.15 145)",
    primaryForeground: "oklch(0.15 0.03 150)",
    accent: "oklch(0.82 0.15 128)",
    swatch: ["oklch(0.78 0.15 145)", "oklch(0.2 0.04 145)"],
    backgroundImage: "/live-themes/fernwood.jpg",
  },
  // ── Photo themes ─────────────────────────────────────────────────────────
  // These render a full-bleed image. Their accent (primary/accent) is curated
  // to harmonize with the photo so buttons and the dimmed aurora still feel
  // part of the scene. `background` is the fallback gradient shown behind the
  // image while it loads.
  {
    id: "evergreen",
    name: "Evergreen",
    description: "Sunlit green needles up close.",
    background: "linear-gradient(160deg, oklch(0.16 0.04 145), oklch(0.2 0.06 140) 45%, oklch(0.28 0.08 135))",
    primary: "oklch(0.82 0.17 135)",
    primaryForeground: "oklch(0.15 0.04 145)",
    accent: "oklch(0.85 0.16 120)",
    swatch: ["oklch(0.82 0.17 135)", "oklch(0.2 0.06 140)"],
    backgroundImage: "/live-themes/evergreen.jpg",
  },
  {
    id: "golden-lake",
    name: "Golden Lake",
    description: "Sunset over a still harbour.",
    background: "linear-gradient(160deg, oklch(0.18 0.04 70), oklch(0.22 0.06 65) 45%, oklch(0.3 0.08 55))",
    primary: "oklch(0.82 0.14 75)",
    primaryForeground: "oklch(0.18 0.04 60)",
    accent: "oklch(0.78 0.16 45)",
    swatch: ["oklch(0.82 0.14 75)", "oklch(0.22 0.06 65)"],
    backgroundImage: "/live-themes/golden-lake.jpg",
  },
  {
    id: "winter-cabin",
    name: "Winter Cabin",
    description: "A warm cabin by a snowy lake.",
    background: "linear-gradient(160deg, oklch(0.16 0.02 260), oklch(0.2 0.03 250) 45%, oklch(0.26 0.05 70))",
    primary: "oklch(0.8 0.14 70)",
    primaryForeground: "oklch(0.18 0.03 60)",
    accent: "oklch(0.74 0.12 40)",
    swatch: ["oklch(0.8 0.14 70)", "oklch(0.2 0.03 250)"],
    backgroundImage: "/live-themes/winter-cabin.jpg",
  },
  {
    id: "fernlight",
    name: "Fernlight",
    description: "A green fern in golden light.",
    background: "linear-gradient(160deg, oklch(0.16 0.04 140), oklch(0.2 0.05 120) 45%, oklch(0.28 0.07 90))",
    primary: "oklch(0.82 0.16 135)",
    primaryForeground: "oklch(0.15 0.04 140)",
    accent: "oklch(0.83 0.14 95)",
    swatch: ["oklch(0.82 0.16 135)", "oklch(0.2 0.05 120)"],
    backgroundImage: "/live-themes/fernlight.jpg",
  },
  {
    id: "sunlit-leaf",
    name: "Sunlit Leaf",
    description: "A single backlit leaf glowing green.",
    background: "linear-gradient(160deg, oklch(0.14 0.03 150), oklch(0.18 0.05 145) 45%, oklch(0.24 0.07 140))",
    primary: "oklch(0.8 0.17 140)",
    primaryForeground: "oklch(0.14 0.03 150)",
    accent: "oklch(0.83 0.16 125)",
    swatch: ["oklch(0.8 0.17 140)", "oklch(0.18 0.05 145)"],
    backgroundImage: "/live-themes/sunlit-leaf.jpg",
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

/**
 * Small, optimized thumbnail of a theme's photo — for the picker swatches only.
 * The full room backgrounds are multi-megabyte photos (winter-cabin alone is
 * ~3.7MB); rendering them into a grid of tiny swatches made the theme/background
 * picker download ~8MB of imagery just to preview it, which is why it opened so
 * slowly. Bundled presets ship a ~10-25KB thumbnail alongside the original at
 * `/live-themes/thumbs/<name>.jpg`; custom uploads (blob/https/data) have no
 * thumbnail, so they fall back to the original URL.
 */
export function liveThemeThumbUrl(id: string | null | undefined): string | null {
  const url = liveThemeImageUrl(id)
  if (!url) return null
  if (url.startsWith("/live-themes/")) return url.replace("/live-themes/", "/live-themes/thumbs/")
  return url
}

/**
 * Style for a theme PICKER SWATCH. Identical accent variables to
 * `liveThemeStyle`, but it paints the lightweight thumbnail instead of the
 * full-resolution room photo, so opening the picker is instant.
 */
export function liveThemeSwatchStyle(id: string | null | undefined): CSSProperties {
  const thumb = liveThemeThumbUrl(id)
  if (thumb) {
    const t = getLiveTheme(id)
    const cssUrl = `url("${thumb.replace(/"/g, '\\"')}")`
    return {
      background: `${PHOTO_SCRIM}, ${cssUrl} center / cover no-repeat`,
      backgroundColor: "oklch(0.11 0.005 285)",
      ["--live-accent" as string]: t.accent,
      ["--primary" as string]: t.primary,
      ["--primary-foreground" as string]: t.primaryForeground,
      ["--ring" as string]: t.primary,
    } as CSSProperties
  }
  return liveThemeStyle(id)
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
