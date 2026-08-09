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

  // Count of live streams per category so each control can show a tally and
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
  const countFor = (c: string) => (c === ALL ? streams.length : (counts.get(c) ?? 0))

  // Accent-aware styling to match the main Live tab: Video → amber (--primary),
  // Audio → red (--live). Every active/emphasis surface below flips with type.
  const isVideo = type === "video"
  const activeChip = isVideo ? "bg-primary text-primary-foreground" : "bg-live text-white"
  const activeChipBadge = isVideo
    ? "bg-primary-foreground/20 text-primary-foreground"
    : "bg-white/20 text-white"
  const accentSoft = isVideo ? "bg-primary/15 text-primary" : "bg-live/15 text-live"
  const accentGlow = isVideo
    ? "before:bg-[linear-gradient(90deg,transparent,var(--primary),transparent)]"
    : "before:bg-[linear-gradient(90deg,transparent,var(--live),transparent)]"

  return (
    <div className="lg:flex lg:gap-6">
      {/* ── Mobile / tablet: horizontal scrolling category chips ─────────────
          A single edge-to-edge, swipeable row of pills. No wasted half-width
          rail and no truncated labels — each chip sizes to its full name. */}
      <div className="-mx-4 mb-4 sm:-mx-6 lg:hidden">
        <div
          className="flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Live categories"
        >
          {rail.map((c) => {
            const active = category === c
            const count = countFor(c)
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(c)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                  active ? activeChip : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{c}</span>
                <span
                  className={cn(
                    "min-w-4 rounded-full px-1.5 text-center text-[11px] tabular-nums",
                    active ? activeChipBadge : "bg-background/60 text-foreground/70",
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Desktop: vertical, independently scrollable, sticky rail ───────── */}
      <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-52 shrink-0 overflow-y-auto pb-6 lg:block">
        <nav className="flex flex-col gap-1" aria-label="Live categories">
          {rail.map((c) => {
            const active = category === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  active ? activeChip : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="truncate">{c}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    active ? (isVideo ? "text-primary-foreground/70" : "text-white/70") : "text-muted-foreground/60",
                  )}
                >
                  {countFor(c)}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Stream grid — full width on mobile, fills remaining space beside
          the desktop rail. Columns scale up with viewport width. ─────────── */}
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <span className={cn("flex size-7 items-center justify-center rounded-lg", accentSoft)}>
            <Icon className="size-4" />
          </span>
          <h2 className="text-base font-bold tracking-tight">{category === ALL ? "All shows" : category}</h2>
          <span
            className={cn(
              "ml-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              filtered.length > 0 ? accentSoft : "bg-secondary text-muted-foreground",
            )}
          >
            {filtered.length} live
          </span>
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
            {filtered.map((stream) => (
              <LiveStreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        ) : (
          <div
            className={cn(
              "relative flex flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-border/60 bg-card px-6 py-8 text-center",
              "before:absolute before:inset-x-8 before:top-0 before:h-px before:content-['']",
              accentGlow,
            )}
          >
            <span className={cn("flex size-11 items-center justify-center rounded-xl", accentSoft)}>
              <Icon className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-bold tracking-tight text-foreground">Nothing live here yet</p>
              <p className="mx-auto max-w-xs text-[13px] text-muted-foreground text-pretty">
                No {type} shows live{category === ALL ? " right now" : ` in ${category}`}. Check back soon.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
