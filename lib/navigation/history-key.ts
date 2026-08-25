/**
 * Stable identity for the CURRENT browser history entry.
 *
 * Transient UI state (scroll offsets, and anything else too noisy for the URL)
 * has to be keyed to a specific point in the user's history, not to a URL: the
 * same URL can legitimately appear several times in one session — Feed → Post →
 * Profile → that same Post — and each visit deserves its own remembered scroll
 * position.
 *
 * The key is stamped into `history.state`, so it survives Back/Forward and a
 * reload of that entry, and is thrown away when the entry is.
 */

const KEY = "__freqNavKey"

/** True when running in the browser and history is usable. */
function canUseHistory() {
  return typeof window !== "undefined" && typeof window.history !== "undefined"
}

/**
 * Returns this history entry's key, creating and stamping one if absent.
 *
 * Existing `history.state` is spread through rather than replaced: Next.js keeps
 * its own router internals in there, and clobbering them breaks client
 * navigation in ways that are painful to diagnose.
 */
export function getHistoryKey(): string {
  if (!canUseHistory()) return "ssr"
  const state = window.history.state as Record<string, unknown> | null
  const existing = state?.[KEY]
  if (typeof existing === "string") return existing

  const key = `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  try {
    window.history.replaceState({ ...(state ?? {}), [KEY]: key }, "")
  } catch {
    // Some embedded webviews reject replaceState; fall back to a per-call key,
    // which simply means scroll restoration is skipped rather than broken.
  }
  return key
}

/**
 * Session-scoped counter of in-app navigations.
 *
 * `window.history.length` cannot answer "is there somewhere of OURS to go
 * back to": it counts entries from other origins visited in the same tab, so on
 * a deep link opened from an email it is often already > 1 and Back would throw
 * the user out of the app. This counter only ever increments for navigations
 * that happened inside Frequency.
 */
const DEPTH_KEY = "freq:nav-depth"

export function getNavDepth(): number {
  if (typeof window === "undefined") return 0
  const raw = window.sessionStorage?.getItem(DEPTH_KEY)
  const n = raw ? Number.parseInt(raw, 10) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function bumpNavDepth(delta: 1 | -1) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(DEPTH_KEY, String(Math.max(0, getNavDepth() + delta)))
  } catch {
    // Private-mode storage failures degrade to the fallbackHref path.
  }
}
