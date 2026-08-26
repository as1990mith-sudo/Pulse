import { BroadcastSignal } from "@/components/live/broadcast-signal"

/**
 * The Live tab's opening statement. Edge-to-edge and atmospheric: the signal
 * visualiser bleeds out of the top of the screen so the page reads as a
 * broadcast surface from the first pixel, with the copy sitting in the calm
 * centre of the rings.
 *
 * `count` is the number of conversations actually on air, so the statistic is
 * real rather than decorative — it's the single number that answers "is anything
 * happening right now?".
 */
export function LiveHero({ count }: { count: number }) {
  return (
    // Deliberately restrained vertical rhythm: the hero sets the tone, but the
    // featured broadcast has to be visible on a short phone viewport without
    // scrolling, so the hero gets presence through type and light rather than
    // through height.
    <header className="relative overflow-hidden pb-5 pt-6">
      <BroadcastSignal />

      {/* Fade the visualiser into the page background so there's no hard seam
          where the hero ends and the listing begins. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent"
      />

      <div className="relative px-5">
        <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-live">
          <span className="relative flex size-1.5">
            <span className="animate-live-pulse absolute inset-0 rounded-full bg-live" />
            <span className="relative size-1.5 rounded-full bg-live" />
          </span>
          Live right now
        </span>

        <h1 className="mt-2.5 max-w-[16ch] text-balance text-[clamp(1.75rem,8.6vw,2.75rem)] font-extrabold leading-[1.0] tracking-[-0.02em]">
          Find the conversation happening now.
        </h1>

        <div className="mt-4 flex items-center gap-3">
          <span aria-hidden="true" className="h-px w-8 shrink-0 bg-live/60" />
          <p className="text-sm font-medium text-foreground/75">
            <span className="tabular-nums font-bold text-foreground">{count}</span>{" "}
            {count === 1 ? "conversation" : "conversations"} happening now
          </p>
        </div>
      </div>
    </header>
  )
}
