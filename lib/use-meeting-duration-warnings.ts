"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

// Host-only wrap-up warnings before a live session hits its hard max duration.
// Fired off the SERVER-computed remaining time (getCallState.remainingMs), never
// the host's device clock, so they can't drift or double-fire and they survive a
// host reconnect (the server timer continues from where it was, never resets).
const THRESHOLDS = [
  { ms: 15 * 60_000, label: "Meeting ends in 15 minutes." },
  { ms: 5 * 60_000, label: "Meeting ends in 5 minutes." },
  { ms: 60_000, label: "Meeting ends in 1 minute." },
] as const

/**
 * Shows a discreet host-only toast at 15 / 5 / 1 minutes before the session's
 * maximum duration. Each warning fires at most once per mount.
 *
 * - No-op unless `isHost` — participants and guests never see these.
 * - On first read, thresholds already passed (e.g. the host reconnected AFTER a
 *   boundary) are marked as seen WITHOUT toasting, so a reconnect mid-meeting
 *   never dumps stale warnings; only genuinely upcoming crossings toast.
 */
export function useMeetingDurationWarnings({
  isHost,
  remainingMs,
}: {
  isHost: boolean
  remainingMs: number | null | undefined
}) {
  const firedRef = useRef<Set<number>>(new Set())
  const seededRef = useRef(false)

  useEffect(() => {
    if (!isHost || remainingMs == null) return

    // First reading with a known remaining time: seed (don't toast) any
    // threshold we're already past so we only announce future crossings.
    if (!seededRef.current) {
      seededRef.current = true
      for (const t of THRESHOLDS) {
        if (remainingMs <= t.ms) firedRef.current.add(t.ms)
      }
      return
    }

    for (const t of THRESHOLDS) {
      if (remainingMs <= t.ms && !firedRef.current.has(t.ms)) {
        firedRef.current.add(t.ms)
        toast(t.label)
      }
    }
  }, [isHost, remainingMs])
}
