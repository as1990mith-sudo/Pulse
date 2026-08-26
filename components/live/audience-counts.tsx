"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { getLiveAudienceCounts } from "@/app/actions/live"
import { cn } from "@/lib/utils"

const AudienceCountsContext = createContext<Record<string, number>>({})

/**
 * Keeps every visible broadcast's listener count fresh from ONE poller.
 *
 * A poller per tile would issue N requests every interval and drift out of sync
 * with each other; this fetches all rooms in a single grouped query and fans the
 * result out through context. Seeded with server-rendered counts so the first
 * paint already shows real numbers rather than zeros.
 *
 * Polling pauses while the tab is hidden — a backgrounded Live tab has no reason
 * to keep hitting the database, and it resumes with an immediate refresh so
 * returning to the tab shows current numbers straight away.
 */
export function AudienceCountsProvider({
  roomNames,
  initial,
  intervalMs = 15_000,
  children,
}: {
  roomNames: string[]
  initial: Record<string, number>
  intervalMs?: number
  children: React.ReactNode
}) {
  const [counts, setCounts] = useState(initial)
  // Re-seed if the server sends a new set of streams (revalidation).
  useEffect(() => setCounts(initial), [initial])

  // Keep the room list in a ref so changing it doesn't tear down the interval.
  const roomsRef = useRef(roomNames)
  roomsRef.current = roomNames
  const key = roomNames.join(",")

  useEffect(() => {
    if (roomsRef.current.length === 0) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    async function refresh() {
      if (document.hidden) return
      try {
        const next = await getLiveAudienceCounts(roomsRef.current)
        if (!cancelled) setCounts(next)
      } catch {
        /* transient — keep the last known counts and try again next tick */
      }
    }

    function start() {
      stop()
      timer = setInterval(refresh, intervalMs)
    }
    function stop() {
      if (timer) clearInterval(timer)
      timer = undefined
    }
    function onVisibility() {
      if (document.hidden) {
        stop()
      } else {
        void refresh()
        start()
      }
    }

    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [key, intervalMs])

  return <AudienceCountsContext.Provider value={counts}>{children}</AudienceCountsContext.Provider>
}

/** Current listener count for a room, or 0 before the first poll resolves. */
export function useAudienceCount(roomName: string): number {
  return useContext(AudienceCountsContext)[roomName] ?? 0
}

function format(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

/**
 * The listener count on a broadcast tile. `tabular-nums` stops the row from
 * reflowing as the digits tick, so the update reads as a quiet change in place
 * rather than a jump.
 */
export function AudienceCount({
  roomName,
  className,
  showLabel = true,
}: {
  roomName: string
  className?: string
  showLabel?: boolean
}) {
  const count = useAudienceCount(roomName)
  return (
    <span className={cn("inline-flex items-baseline gap-1 tabular-nums", className)}>
      <span className="font-semibold">{format(count)}</span>
      {showLabel && <span className="text-[0.9em] opacity-70">listening</span>}
    </span>
  )
}
