"use client"

import { useEffect, useState } from "react"

/**
 * A single, app-wide mute preference for feed videos and the expanded reel
 * player. Previously each surface tracked its own mute state, so a clip could
 * be playing with sound in the feed while the expanded player was muted (and
 * vice-versa). Sharing one module-level value keeps every video player in sync:
 * unmuting anywhere unmutes everywhere, and muting anywhere mutes everywhere.
 *
 * Videos play WITH SOUND by default. That intent is tracked separately from the
 * mute a browser forces on us, because the two have very different lifetimes:
 *
 * - `userMuted` is an explicit tap on a mute toggle. It sticks until the user
 *   taps again.
 * - `autoplayBlocked` is the browser refusing unmuted autoplay before the page
 *   has been interacted with. Mobile browsers only allow autoplay while a video
 *   is *genuinely* muted, so a player that wants to start before any gesture
 *   must fall back to muted playback.
 *
 * Keeping them apart is the whole point. When the two were collapsed into one
 * boolean, the autoplay fallback wrote "muted" into the user's preference, so a
 * single blocked autoplay on page load left every video muted for the rest of
 * the session — the mute button read "Muted" by default and nothing ever
 * cleared it. Now the forced mute is transient: the first real user gesture
 * unlocks audio and playback becomes audible on its own, without the user
 * having to hunt for the unmute button.
 */

/** The user's explicit choice. Unmuted by default — sound is the intent. */
let userMuted = false
/** Set when the browser rejects unmuted playback; cleared on the first gesture. */
let autoplayBlocked = false

const listeners = new Set<(muted: boolean) => void>()

/** What a player should actually apply to its `video.muted` property. */
function effectiveMuted() {
  return userMuted || autoplayBlocked
}

function notify() {
  const value = effectiveMuted()
  listeners.forEach((fn) => fn(value))
}

export function getSharedMuted() {
  return effectiveMuted()
}

/**
 * Record an explicit user mute/unmute. Because this only ever runs from a tap on
 * a mute control, it doubles as proof of a user gesture — so it also clears any
 * autoplay-forced mute, letting an unmute take effect immediately.
 */
export function setSharedMuted(next: boolean) {
  const before = effectiveMuted()
  userMuted = next
  autoplayBlocked = false
  if (effectiveMuted() !== before) notify()
}

/**
 * Called by a player when the browser refused to start playback with sound.
 * Forces muted playback for now WITHOUT touching the user's preference, so
 * audio can come back on the first gesture. No-op once the user has chosen mute
 * themselves — there'd be nothing to restore.
 */
export function noteAutoplayBlocked() {
  if (autoplayBlocked || userMuted) return
  autoplayBlocked = true
  notify()
}

/**
 * Clear an autoplay-forced mute once the page has been interacted with. Audio is
 * unlocked from here on, so the in-focus video can play with sound.
 *
 * Exported because some audio-unlocking gestures need to be reported directly
 * rather than observed. Opening the full-screen viewer is the important one: the
 * tap that opens it is a real gesture, but the new <video> mounts *after* that
 * tap has already been handled, so a `play()` rejection there would otherwise
 * re-arm the forced mute with no further gesture left to clear it.
 */
export function noteUserGesture() {
  if (!autoplayBlocked) return
  autoplayBlocked = false
  notify()
}

let gestureListenerInstalled = false

/**
 * Listen for real user gestures anywhere on the page and use them to lift an
 * autoplay-forced mute. Registered in the capture phase and marked passive so it
 * never interferes with the UI it observes. `click` is intentionally omitted:
 * `pointerdown` already precedes it, so audio unlocks on press rather than
 * release.
 *
 * The listeners stay installed for the life of the page instead of detaching
 * after the first gesture. Detaching made the forced mute a ONE-WAY LATCH: a
 * block that happened after that first gesture (most obviously a fresh <video>
 * mounting in the full-screen viewer) set `autoplayBlocked` with no listener
 * left to ever clear it, so every player stayed muted for the rest of the
 * session. `noteUserGesture` is a cheap no-op once the flag is already clear,
 * so leaving these attached costs nothing.
 */
function installGestureListener() {
  if (gestureListenerInstalled || typeof window === "undefined") return
  gestureListenerInstalled = true

  for (const type of ["pointerdown", "touchstart", "keydown"] as const) {
    window.addEventListener(type, noteUserGesture, { capture: true, passive: true })
  }
}

/**
 * Subscribe a component to the shared mute preference. Returns the current
 * value and a setter that updates every subscribed player at once.
 */
export function useSharedMute(): [boolean, (next: boolean) => void] {
  const [muted, setMuted] = useState(effectiveMuted())
  useEffect(() => {
    installGestureListener()
    // Re-sync on mount in case the value changed before this subscriber existed.
    setMuted(effectiveMuted())
    const fn = (m: boolean) => setMuted(m)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return [muted, setSharedMuted]
}
