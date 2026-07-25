"use client"

import { useEffect, useState } from "react"

/**
 * A single, app-wide mute preference for feed videos and the expanded reel
 * player. Previously each surface tracked its own mute state, so a clip could
 * be playing with sound in the feed while the expanded player was muted (and
 * vice-versa). Sharing one module-level value keeps every video player in sync:
 * unmuting anywhere unmutes everywhere, and muting anywhere mutes everywhere.
 *
 * Defaults to muted (`true`) because mobile browsers only allow autoplay while
 * a video is genuinely muted — both the feed and the reel player rely on that
 * to start playback without a user gesture. The first tap on a mute toggle then
 * carries the user's choice across all surfaces.
 */
let sharedMuted = true
const listeners = new Set<(muted: boolean) => void>()

export function getSharedMuted() {
  return sharedMuted
}

export function setSharedMuted(next: boolean) {
  if (sharedMuted === next) return
  sharedMuted = next
  listeners.forEach((fn) => fn(next))
}

/**
 * Subscribe a component to the shared mute preference. Returns the current
 * value and a setter that updates every subscribed player at once.
 */
export function useSharedMute(): [boolean, (next: boolean) => void] {
  const [muted, setMuted] = useState(sharedMuted)
  useEffect(() => {
    // Re-sync on mount in case the value changed before this subscriber existed.
    setMuted(sharedMuted)
    const fn = (m: boolean) => setMuted(m)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return [muted, setSharedMuted]
}
