import type { CSSProperties } from "react"
import { LIVE_THEMES } from "@/lib/live-themes"

/**
 * Chat wallpapers for 1-on-1 conversations (and reusable by group chatrooms).
 * A selection is a single app-wide preference — persisted once in localStorage
 * and applied to every direct-message thread in the inbox.
 *
 * The wallpaper set is the SAME collection used to theme live meeting rooms
 * (see `lib/live-themes.ts`), so the two surfaces share one visual language.
 * We derive the options directly from `LIVE_THEMES` rather than duplicating the
 * assets/gradients, which keeps them in sync automatically.
 *
 * Three flavors:
 *  - `default` — the app's normal dark message surface (no wallpaper).
 *  - `gradient` — a CSS gradient laid behind the bubbles.
 *  - `photo` — a full-bleed photographic wallpaper.
 */
export type ChatBackgroundKind = "default" | "gradient" | "photo"

export type ChatBackground = {
  id: string
  label: string
  kind: ChatBackgroundKind
  /** CSS background value for `gradient` (and the swatch for photos). */
  gradient?: string
  /** Public image path for `photo`. */
  image?: string
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  // The plain dark message surface stays as the neutral first choice.
  { id: "default", label: "Default", kind: "default" },

  // Everything else mirrors the live-meeting themes. Photo themes become photo
  // wallpapers; the flat-gradient themes become gradient wallpapers. Ids are
  // prefixed so they never collide with a live theme id or an old chat id.
  ...LIVE_THEMES.map<ChatBackground>((t) => ({
    id: `live-${t.id}`,
    label: t.name,
    kind: t.backgroundImage ? "photo" : "gradient",
    gradient: t.background,
    image: t.backgroundImage,
  })),
]

export const DEFAULT_CHAT_BACKGROUND = CHAT_BACKGROUNDS[0]

export function getChatBackground(id: string | null | undefined): ChatBackground {
  return CHAT_BACKGROUNDS.find((b) => b.id === id) ?? DEFAULT_CHAT_BACKGROUND
}

/** Inline style for the scrollable message surface for a given background id. */
export function chatBackgroundStyle(id: string | null | undefined): CSSProperties {
  const bg = getChatBackground(id)
  if (bg.kind === "gradient") return { backgroundImage: bg.gradient }
  if (bg.kind === "photo") {
    return {
      backgroundImage: `url(${bg.image})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    }
  }
  return {}
}

/** Small swatch style for the picker chips. */
export function chatBackgroundSwatchStyle(bg: ChatBackground): CSSProperties {
  if (bg.kind === "gradient") return { backgroundImage: bg.gradient }
  if (bg.kind === "photo") {
    return { backgroundImage: `url(${bg.image})`, backgroundSize: "cover", backgroundPosition: "center" }
  }
  return {}
}

/**
 * Single global key for the DM wallpaper preference. Previously the wallpaper
 * was scoped per conversation (`dm-chat-bg:<id>`); it is now one shared choice
 * applied across every direct-message thread.
 */
export const CHAT_BACKGROUND_STORAGE_KEY = "dm-chat-bg"
