import type { CSSProperties } from "react"

/**
 * Chat wallpapers for 1-on-1 conversations (and reusable by group chatrooms).
 * A selection is scoped to a single conversation — persisted in localStorage
 * keyed by conversation id, never shared across threads.
 *
 * Three flavors:
 *  - `default` — the app's normal dark message surface (no wallpaper).
 *  - `gradient` — a CSS gradient laid behind the bubbles.
 *  - `photo` — a softly blurred photographic wallpaper (generated asset).
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
  { id: "default", label: "Default", kind: "default" },

  // 3 gradient options
  {
    id: "grad-dusk",
    label: "Dusk",
    kind: "gradient",
    gradient: "linear-gradient(160deg, oklch(0.17 0.03 285), oklch(0.22 0.06 300) 55%, oklch(0.16 0.04 255))",
  },
  {
    id: "grad-tide",
    label: "Tide",
    kind: "gradient",
    gradient: "linear-gradient(160deg, oklch(0.15 0.02 205), oklch(0.2 0.05 195) 55%, oklch(0.16 0.03 235))",
  },
  {
    id: "grad-ember",
    label: "Ember",
    kind: "gradient",
    gradient: "linear-gradient(160deg, oklch(0.16 0.03 30), oklch(0.21 0.06 45) 55%, oklch(0.15 0.03 15))",
  },

  // 7 blurred photo options
  { id: "photo-aurora", label: "Aurora", kind: "photo", image: "/chat-bg/aurora.png" },
  { id: "photo-mountains", label: "Mountains", kind: "photo", image: "/chat-bg/mountains.png" },
  { id: "photo-ocean", label: "Ocean", kind: "photo", image: "/chat-bg/ocean.png" },
  { id: "photo-forest", label: "Forest", kind: "photo", image: "/chat-bg/forest.png" },
  { id: "photo-sunset", label: "Sunset", kind: "photo", image: "/chat-bg/sunset.png" },
  { id: "photo-blossom", label: "Blossom", kind: "photo", image: "/chat-bg/blossom.png" },
  { id: "photo-city", label: "City", kind: "photo", image: "/chat-bg/city.png" },
  { id: "photo-nebula", label: "Nebula", kind: "photo", image: "/chat-bg/nebula.png" },
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

const STORAGE_PREFIX = "dm-chat-bg:"

export function chatBackgroundStorageKey(conversationId: number | string) {
  return `${STORAGE_PREFIX}${conversationId}`
}
