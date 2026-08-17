"use client"

/**
 * App-wide "single inline video" coordinator.
 *
 * Problem: every `FeedVideo` decides to autoplay on its own once it is ≥60%
 * scrolled into view. On a tall list two stacked clips can satisfy that at the
 * same moment (or a new one enters view before the previous one leaves), so two
 * videos play — and blast audio — at once.
 *
 * Solution: inline players don't play directly. When a player is eligible to
 * play (in view and not user-paused) it *registers* here; when it stops being
 * eligible it unregisters. On every change we pick the single registered player
 * closest to the viewport center as the winner, tell it to play, and tell every
 * other registered player to pause. Only one inline clip is ever the active one.
 *
 * This is intentionally separate from the immersive-viewer gate in
 * `video-handoff.ts`, which handles inline-vs-fullscreen. This handles
 * inline-vs-inline within the same scroll view (main feed, community help, etc).
 */

interface VideoEntry {
  /** Distance (px) from the entry's center to the viewport center; lower wins. */
  distanceToCenter: () => number
  /** Called when this entry becomes the single active inline video. */
  play: () => void
  /** Called when this entry must yield to another (or none) being active. */
  pause: () => void
}

const entries = new Set<VideoEntry>()
let active: VideoEntry | null = null
// A clip the user explicitly started. It wins the active slot regardless of
// distance to center, until it leaves view (unregisters) or the user starts a
// different one — so a manual tap is never immediately overridden by proximity.
let manual: VideoEntry | null = null

/** Recompute which registered entry should be playing and enforce it. */
function reconcile() {
  let winner: VideoEntry | null = null
  if (manual && entries.has(manual)) {
    winner = manual
  } else {
    let best = Number.POSITIVE_INFINITY
    for (const entry of entries) {
      const d = entry.distanceToCenter()
      if (d < best) {
        best = d
        winner = entry
      }
    }
  }

  if (winner !== active) {
    active = winner
  }

  // Pause everyone that isn't the winner; play the winner. We call play/pause
  // every reconcile (not just on change) because a clip can be paused by the
  // browser or another gate and needs re-asserting when it wins again — the
  // player's own handlers make these idempotent.
  for (const entry of entries) {
    if (entry === winner) entry.play()
    else entry.pause()
  }
}

/**
 * Register a player as eligible to play. Returns an unregister function.
 * Registering (or unregistering) immediately reconciles the active winner.
 */
export function registerActiveVideo(entry: VideoEntry): () => void {
  entries.add(entry)
  reconcile()
  return () => {
    const wasActive = active === entry
    entries.delete(entry)
    if (wasActive) active = null
    if (manual === entry) manual = null
    reconcile()
  }
}

/**
 * Mark a registered entry as the user's explicit choice so it wins the active
 * slot regardless of scroll proximity. Pass null to clear the manual override
 * and fall back to nearest-to-center selection.
 */
export function setManualActiveVideo(entry: VideoEntry | null) {
  manual = entry
  reconcile()
}

/**
 * Ask the coordinator to re-evaluate the winner — call this on scroll so the
 * clip nearest the viewport center takes over as the user scrolls between two
 * simultaneously-visible videos.
 */
export function reconcileActiveVideo() {
  reconcile()
}
