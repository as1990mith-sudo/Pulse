"use client"

import { useEffect, useState } from "react"

/**
 * Coordinates the hand-off between an inline feed video (`FeedVideo`) and the
 * full-screen immersive reel viewer (`ReelsFeed`) it expands into.
 *
 * Two problems this solves:
 * 1. Expanding a clip used to open a SECOND, independent <video> that started
 *    from 0 while the inline clip kept playing behind the overlay — so two
 *    videos played at once ("each plays its own thing"). While the viewer is
 *    open we broadcast an `open` flag; inline feed videos pause and suspend
 *    their scroll-based autoplay so only the expanded player plays.
 * 2. The expanded player restarted from the beginning. We remember the inline
 *    clip's latest absolute playback position (keyed by source URL) so the reel
 *    can resume from exactly where the feed left off.
 */

// ---- Last known playback position per source URL -------------------------

const positions = new Map<string, number>()

function stripFragment(src: string) {
  const i = src.indexOf("#")
  return i === -1 ? src : src.slice(0, i)
}

/** Record a clip's latest absolute playback time (seconds). */
export function rememberVideoPosition(src: string, time: number) {
  if (!src || !Number.isFinite(time) || time < 0) return
  positions.set(stripFragment(src), time)
}

/** Read a clip's remembered playback time, if any. */
export function getVideoPosition(src: string): number | undefined {
  if (!src) return undefined
  return positions.get(stripFragment(src))
}

// ---- Immersive viewer open/closed signal ---------------------------------

let viewerOpen = false
const openListeners = new Set<(open: boolean) => void>()

export function setImmersiveViewerOpen(open: boolean) {
  if (viewerOpen === open) return
  viewerOpen = open
  openListeners.forEach((fn) => fn(open))
}

export function getImmersiveViewerOpen() {
  return viewerOpen
}

/** Subscribe a component to whether the immersive video viewer is open. */
export function useImmersiveViewerOpen(): boolean {
  const [open, setOpen] = useState(viewerOpen)
  useEffect(() => {
    setOpen(viewerOpen)
    const fn = (o: boolean) => setOpen(o)
    openListeners.add(fn)
    return () => {
      openListeners.delete(fn)
    }
  }, [])
  return open
}
