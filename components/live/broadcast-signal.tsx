import { cn } from "@/lib/utils"

/**
 * The Live tab's signature visual: concentric frequency rings radiating from a
 * point, over a slow orange→red bloom.
 *
 * Deliberately pure CSS with no client hooks — it renders identically on the
 * server, costs no JS, and animates only transform/opacity so it stays on the
 * compositor while the page scrolls. `bars` adds a soft equaliser rail along the
 * bottom edge; `dormant` swaps the radiating pulse for a single breathing ring
 * (the "air is quiet" state) so the same component covers both moods.
 */
export function BroadcastSignal({
  className,
  dormant = false,
  bars = false,
}: {
  className?: string
  dormant?: boolean
  bars?: boolean
}) {
  // Ring scales are fixed (not random) so server and client markup always match.
  const rings = [0, 1, 2, 3]
  // Irregular-but-fixed bar pattern; each bar gets its own duration + delay so
  // one keyframe yields a living, non-uniform waveform.
  const barPattern = [0.4, 0.7, 0.3, 0.85, 0.5, 0.65, 0.35, 0.9, 0.45, 0.6, 0.28, 0.75, 0.52, 0.38, 0.68, 0.3]

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {/* Ambient bloom — the only large colour field on the page. Sits low-opacity
          behind everything so the interface reads as lit, not glowing. */}
      <div
        className={cn(
          "absolute left-1/2 top-0 size-[130%] -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl",
          "bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_62%)]",
          dormant ? "opacity-[0.14]" : "broadcast-bloom opacity-30",
        )}
      />

      {/* Concentric rings. Centred on the same point as the bloom. */}
      <div className="absolute left-1/2 top-0 size-[min(120vw,34rem)] -translate-x-1/2 -translate-y-[45%]">
        {dormant ? (
          <>
            <span className="quiet-air absolute inset-0 rounded-full border border-foreground/12" />
            <span
              className="quiet-air absolute inset-[18%] rounded-full border border-foreground/10"
              style={{ animationDelay: "1.6s" }}
            />
          </>
        ) : (
          rings.map((i) => (
            <span
              key={i}
              className="broadcast-ring absolute inset-0 rounded-full border border-live/40"
              style={{ animationDelay: `${i * 1.2}s` }}
            />
          ))
        )}
      </div>

      {bars && (
        <div className="absolute inset-x-0 bottom-0 flex h-14 items-end justify-between gap-[2px] px-5 opacity-40">
          {barPattern.map((h, i) => (
            <span
              key={i}
              className="broadcast-bar flex-1 rounded-full bg-gradient-to-t from-live to-primary/70"
              style={
                {
                  height: `${Math.round(h * 100)}%`,
                  "--bar-dur": `${1.1 + (i % 5) * 0.22}s`,
                  "--bar-delay": `${(i % 7) * 0.13}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
