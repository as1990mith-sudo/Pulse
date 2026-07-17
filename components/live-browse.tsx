"use client"

import { useMemo, useState } from "react"
import { Video, Mic } from "lucide-react"
import { cn } from "@/lib/utils"
import { LiveStreamCard } from "@/components/live-stream-card"
import { LIVE_CATEGORIES } from "@/lib/live-categories"
import type { LiveStreamView, LiveMode } from "@/app/actions/live"

const ALL = "All" as const

export function LiveBrowse({
  streams,
  type,
}: {
  streams: LiveStreamView[]
  type: LiveMode
}) {
  const [category, setCategory] = useState<string>(ALL)

  // Count of live streams per category so each rail item can show a tally and
  // empty categories are still selectable (they just render an empty state).
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of streams) {
      if (s.category) map.set(s.category, (map.get(s.category) ?? 0) + 1)
    }
    return map
  }, [streams])

  const filtered = useMemo(
    () => (category === ALL ? streams : streams.filter((s) => s.category === category)),
    [streams, category],
  )

  const Icon = type === "video" ? Video : Mic
  const rail = [ALL, ...LIVE_CATEGORIES]

  return (
    <div className="flex gap-4 sm:gap-6">
      {/* Category rail — vertical, independently scrollable, sticky under the
          page header so it stays in view while the grid scrolls. */}
      <aside className="sticky top-20 h-[calc(100vh-6rem)] w-32 shrink-0 overflow-y-auto pb-6 sm:w-44">
        <nav className="flex flex-col gap-1" aria-label="Live categories">
          {rail.map((c) => {
            const active = category === c
            const count = c === ALL ? streams.length : (counts.get(c) ?? 0)
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="truncate">{c}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    active ? "text-primary-foreground/70" : "text-muted-foreground/60",
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Stream grid — two columns, scrolls with the page down to the last show. */}
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {category === ALL ? "All" : category}
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {filtered.length} {filtered.length === 1 ? "live" : "live"}
            </span>
          </h2>
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {filtered.map((stream) => (
              <LiveStreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No {type} shows live{category === ALL ? " right now" : ` in ${category}`}.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
