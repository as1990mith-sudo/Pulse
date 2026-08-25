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
 * How deep into the app this history entry is.
 *
 * `window.history.length` cannot answer "is there somewhere of OURS to go back
 * to": it counts entries from other origins visited in the same tab, so on a link
 * opened from an email it is often already > 1 and Back would throw the user out
 * of the app entirely.
 *
 * The depth is stored ON each history entry rather than as a single session-wide
 * counter that gets incremented and decremented. A running counter has to be
 * adjusted from several places at once — a forward navigation, a popstate, an
 * overlay opening — and any missed or doubled adjustment silently corrupts it for
 * the rest of the session, which is very hard to notice and even harder to debug.
 *
 * Stamping the value instead makes it self-correcting: going Back restores the
 * entry that already carries its own depth, so the number is always right for
 * wherever the user actually is, no matter how they got there.
 */
const DEPTH_KEY = "__freqNavDepth"

/** The current entry's depth: 0 means "this is where the user entered the app". */
export function getNavDepth(): number {
  if (!canUseHistory()) return 0
  const raw = (window.history.state as Record<string, unknown> | null)?.[DEPTH_KEY]
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0
}

/**
 * True when there is an in-app entry to go back to.
 *
 * Prefer this over `window.history.length > 1`, which is also true for a link
 * opened from an email or another site and would send the user out of the app.
 */
export function hasInAppHistory(): boolean {
  return getNavDepth() > 0
}

/**
 * Stamps a depth onto the CURRENT history entry, without disturbing Next.js's
 * router internals stored alongside it.
 */
export function setNavDepth(depth: number) {
  if (!canUseHistory()) return
  const state = window.history.state as Record<string, unknown> | null
  try {
    window.history.replaceState({ ...(state ?? {}), [DEPTH_KEY]: Math.max(0, depth) }, "")
  } catch {
    // Some embedded webviews reject replaceState; Back then degrades to the
    // fallbackHref, which is a safe outcome rather than a broken one.
  }
}
