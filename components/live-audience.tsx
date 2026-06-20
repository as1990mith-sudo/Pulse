"use client"

import { Users } from "lucide-react"
import { cn } from "@/lib/utils"

// A fixed palette of theme-token tints so the audience bubbles feel varied but
// stay on-brand. We only know the listener *count*, not identities, so these
// are decorative stand-ins for the crowd.
const TINTS = [
  "bg-primary/20 text-primary",
  "bg-call-accept/20 text-call-accept",
  "bg-live/20 text-live",
  "bg-secondary text-foreground",
  "bg-primary/15 text-primary",
  "bg-muted text-muted-foreground",
]

/**
 * The audience section: a row of stacked listener bubbles with the total count.
 * Bubbles are decorative (we only have the aggregate listener count from
 * LiveKit, not individual identities).
 */
export function LiveAudience({ count, className }: { count: number; className?: string }) {
  const shown = Math.min(count, 7)
  const overflow = count - shown

  return (
    <section
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3",
        className,
      )}
      aria-label={`Audience: ${count} listening`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center">
          {count === 0 ? (
            <span className="text-sm text-muted-foreground">Waiting for listeners…</span>
          ) : (
            <div className="flex -space-x-2">
              {Array.from({ length: shown }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2 border-card text-[11px] font-semibold",
                    TINTS[i % TINTS.length],
                  )}
                  aria-hidden="true"
                >
                  <Users className="size-3.5" />
                </span>
              ))}
              {overflow > 0 && (
                <span className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-semibold text-muted-foreground">
                  +{overflow > 99 ? "99" : overflow}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-sm font-semibold tabular-nums">{count.toLocaleString()}</span>
        <span className="text-[11px] text-muted-foreground">in the audience</span>
      </div>
    </section>
  )
}
