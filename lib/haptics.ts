/**
 * Subtle haptic feedback for important interactions.
 *
 * Uses the Web Vibration API, which is supported on most Android browsers and
 * gracefully no-ops everywhere else (including iOS Safari, which has no web
 * vibration support). All calls are safe to make unconditionally — feature
 * detection and the user's reduced-motion preference are handled here.
 */

type HapticPattern = "light" | "medium" | "success" | "warning" | "error"

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 18,
  success: [12, 40, 12],
  warning: [20, 60, 20],
  error: [30, 50, 30, 50, 30],
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Trigger a haptic pulse. No-ops when unsupported or when the user has asked
 * for reduced motion.
 */
export function haptic(pattern: HapticPattern = "light"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
  if (prefersReducedMotion()) return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    /* some browsers throw if called outside a user gesture — ignore */
  }
}
