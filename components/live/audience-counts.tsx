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

/**
 * Listener count that hides itself entirely when nobody is listening yet.
 *
 * A freshly opened room genuinely has zero listeners, and a bare "0" chip reads
 * as a broken value rather than a real one — so the chip is omitted until there
 * is an audience to report.
 *
 * Lives here, in the client module, rather than beside the tiles: the tiles are
 * server components, and a client hook can only be called from a client module.
 * Keeping the count logic on this side of the boundary lets the tiles stay
 * server-rendered while the numbers still update live.
 */
export function AudienceChip({ roomName, className }: { roomName: string; className?: string }) {
  const count = useAudienceCount(roomName)
  if (count === 0) return null
  return (
    <span className={className}>
      <AudienceCount roomName={roomName} showLabel={false} />
    </span>
  )
}

/**
 * The featured tile's audience line. At zero it reports the broadcast's *state*
 * instead of a meaningless "0 listening" — which is the more useful thing to
 * know about a room that has only just opened.
 */
export function FeaturedAudience({ roomName, className }: { roomName: string; className?: string }) {
  const count = useAudienceCount(roomName)
  if (count === 0) return <span className={className}>Just went live</span>
  return <AudienceCount roomName={roomName} className={className} />
}
