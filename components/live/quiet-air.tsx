import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { BroadcastSignal } from "@/components/live/broadcast-signal"

/**
 * The nothing-on-air state, played as a held breath rather than an error.
 *
 * Uses the same signal visualiser as the live hero but in its `dormant` mood — a
 * carrier wave with nothing riding on it — so the empty state feels like the
 * same broadcast surface at rest instead of a different, emptier screen.
 *
 * Hosts get the entry point to fill the silence; members get the reassurance
 * that nothing is broken. The dock below still carries the actual Video/Audio
 * controls, so this link is a prompt, not a duplicate control.
 */
export function QuietAir({ canGoLive }: { canGoLive: boolean }) {
  return (
    <section className="relative flex min-h-[62svh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <BroadcastSignal dormant />

      <div className="relative flex flex-col items-center">
        <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">Off air</span>

        <h1 className="mt-3 text-balance text-[clamp(1.875rem,9vw,2.75rem)] font-extrabold leading-[1.02] tracking-[-0.02em]">
          The air is quiet.
        </h1>

        <p className="mt-3.5 max-w-[26ch] text-pretty text-sm leading-relaxed text-muted-foreground">
          No live conversations are happening right now.
        </p>

        {canGoLive && (
          <Link
            href="#go-live"
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-live/40 bg-live/10 px-5 py-2.5 text-sm font-bold text-live transition-colors hover:border-live/60 hover:bg-live/15"
          >
            Start a live meeting
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  )
}
