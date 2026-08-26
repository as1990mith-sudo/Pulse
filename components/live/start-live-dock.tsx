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
      <div className="overflow-hidden rounded-[1.5rem] border border-foreground/10 bg-background/70 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        <div className="flex items-center gap-2 px-4 pb-2.5 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Start a live</span>
          <span className="h-px flex-1 bg-foreground/10" />
        </div>

        {/* Two controls split by a hairline — reads as a piece of broadcast
            equipment rather than two stacked buttons. */}
        <div className="grid grid-cols-2 divide-x divide-foreground/10 border-t border-foreground/10">
          <DockButton
            icon={Video}
            label="Video"
            hint="Go live with video"
            accent
            onClick={() => go("video")}
          />
          <DockButton icon={Mic} label="Audio" hint="Start an audio room" onClick={() => go("audio")} />
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
      className="group flex items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] active:bg-foreground/[0.07]"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-active:scale-95",
          accent
            ? "bg-live text-live-foreground shadow-md shadow-live/30"
            : "bg-foreground/8 text-foreground ring-1 ring-inset ring-foreground/10",
        )}
      >
        <Icon className="size-4" />
      </span>
      {/* The hint wraps rather than truncates: at 360px two columns leave ~110px
          for text, and "Start an audio room" would clip to "Start an audio ro…"
          — which reads as a bug rather than a label. */}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-bold leading-tight">{label}</span>
        <span className="text-pretty text-[11px] leading-[1.25] text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}
