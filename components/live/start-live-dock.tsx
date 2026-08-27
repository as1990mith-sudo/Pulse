"use client"

import { useRouter } from "next/navigation"
import { Mic, Video } from "lucide-react"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

/**
 * The host's broadcast control on the Live tab.
 *
 * Sticky rather than fixed: it rides just above the bottom nav while the page
 * scrolls, then settles into the end of the content — so the action is always
 * reachable without permanently stacking a second bar over a phone viewport.
 *
 * Rules preserved from the previous hero: the destinations are still
 * `/studio?mode=video|audio` and each press fires the same medium haptic. The
 * caller gates rendering on `canGoLive`; the real security boundary remains the
 * server-side `canViewerGoLive()` check inside `startBroadcast`.
 */
export function StartLiveDock({ canGoLive }: { canGoLive: boolean }) {
  const router = useRouter()

  // Members never see broadcast controls at all — the brief asks for the
  // controls to be absent rather than shown-and-locked.
  if (!canGoLive) return null

  const go = (mode: "video" | "audio") => {
    haptic("medium")
    router.push(`/studio?mode=${mode}`)
  }

  return (
    <div
      id="go-live"
      className="sticky z-30 scroll-mt-24 pt-2"
      // Dock above the floating bottom nav rather than under it.
      style={{ bottom: "calc(var(--bottom-nav-height, 0px) + 0.5rem)" }}
    >
      {/* A single glass instrument. The faint top highlight + deep drop shadow
          give it a lifted, premium feel without adding height. */}
      <div className="relative overflow-hidden rounded-[1.25rem] border border-foreground/10 bg-gradient-to-b from-foreground/[0.06] to-transparent shadow-[0_20px_50px_-28px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />

        <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-2.5">
          {/* Pulsing dot reads as "on air" — the one expressive, load-bearing
              flourish. Everything else stays quiet around it. */}
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-live-pulse rounded-full bg-live" />
            <span className="relative inline-flex size-1.5 rounded-full bg-live" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Start a live</span>
          <span className="h-px flex-1 bg-foreground/10" />
        </div>

        {/* Two controls split by a hairline — reads as a piece of broadcast
            equipment rather than two stacked buttons. */}
        <div className="grid grid-cols-2 divide-x divide-foreground/10">
          <DockButton icon={Video} label="Video" hint="Go live" accent onClick={() => go("video")} />
          <DockButton icon={Mic} label="Audio" hint="Audio room" onClick={() => go("audio")} />
        </div>
      </div>
    </div>
  )
}

function DockButton({
  icon: Icon,
  label,
  hint,
  onClick,
  accent = false,
}: {
  icon: typeof Video
  label: string
  hint: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex items-center gap-2.5 px-3.5 py-3 text-left outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] active:bg-foreground/[0.07]"
    >
      {/* Soft accent bloom behind the hero icon — the artistic touch that marks
          Video as primary. Purely decorative, so it's aria-hidden and can't
          catch pointer events. */}
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1.5 top-1/2 size-11 -translate-y-1/2 rounded-full bg-live/25 blur-xl"
        />
      )}
      <span
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-[0.7rem] transition-transform duration-200 group-active:scale-90",
          accent
            ? "bg-gradient-to-br from-live to-live/80 text-live-foreground shadow-lg shadow-live/40"
            : "bg-foreground/[0.07] text-foreground ring-1 ring-inset ring-foreground/10",
        )}
      >
        <Icon className="size-[18px]" strokeWidth={2.25} />
      </span>
      {/* Both hints are kept short enough to sit on one line at 360px, so the
          two controls stay vertically symmetrical. `whitespace-nowrap` makes
          that a hard guarantee — a wrap here would visibly misalign the pair. */}
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold leading-tight tracking-tight">{label}</span>
        <span className="whitespace-nowrap text-[10.5px] leading-tight text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}
