"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Mic, Plus, Video } from "lucide-react"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

/**
 * The host's broadcast control on the Live tab.
 *
 * A single large "+" FAB rides just above the bottom nav. Pressing it opens a
 * compact, premium chooser with the only two decisions that matter — Video or
 * Audio — and nothing else. Destinations stay `/studio?mode=video|audio` and
 * each press fires the medium haptic. Rendering is gated on `canGoLive`; the
 * real security boundary remains the server `canViewerGoLive()` check inside
 * `startBroadcast`.
 */
export function StartLiveDock({ canGoLive }: { canGoLive: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Members never see broadcast controls at all.
  if (!canGoLive) return null

  const go = (mode: "video" | "audio") => {
    haptic("medium")
    setOpen(false)
    router.push(`/studio?mode=${mode}`)
  }

  return (
    <>
      <div
        id="go-live"
        className="sticky z-30 flex scroll-mt-24 justify-center pt-2"
        style={{ bottom: "calc(var(--bottom-nav-height, 0px) + 0.75rem)" }}
      >
        <button
          type="button"
          onClick={() => {
            haptic("light")
            setOpen(true)
          }}
          aria-label="Start a live"
          className="group relative flex size-16 items-center justify-center rounded-full outline-none active:scale-95 transition-transform duration-200"
        >
          {/* Soft accent bloom — the one expressive flourish. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full bg-live/40 blur-xl transition-opacity duration-300 group-hover:opacity-100 opacity-80"
          />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-live to-live/80 text-live-foreground shadow-[0_16px_40px_-12px] shadow-live/60 ring-1 ring-inset ring-white/20">
            <Plus className="size-8" strokeWidth={2.5} />
          </span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[22rem] gap-0 overflow-hidden rounded-[1.75rem] border-0 bg-gradient-to-b from-card to-background p-0 ring-1 ring-foreground/10"
        >
          <div className="flex items-center justify-center gap-2 pt-6 pb-5">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-live-pulse rounded-full bg-live" />
              <span className="relative inline-flex size-1.5 rounded-full bg-live" />
            </span>
            <DialogTitle className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
              Start a live
            </DialogTitle>
          </div>

          <div className="grid grid-cols-2 gap-3 px-5 pb-6">
            <ChoiceTile icon={Video} label="Video" accent onClick={() => go("video")} />
            <ChoiceTile icon={Mic} label="Audio" onClick={() => go("audio")} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ChoiceTile({
  icon: Icon,
  label,
  onClick,
  accent = false,
}: {
  icon: typeof Video
  label: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex aspect-[4/5] flex-col items-center justify-center gap-3 overflow-hidden rounded-[1.35rem] outline-none transition-all duration-200 active:scale-[0.97]",
        accent
          ? "bg-gradient-to-br from-live/20 to-live/[0.04] ring-1 ring-inset ring-live/40 hover:ring-live/60"
          : "bg-foreground/[0.05] ring-1 ring-inset ring-foreground/10 hover:bg-foreground/[0.08] hover:ring-foreground/20",
      )}
    >
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-6 left-1/2 size-24 -translate-x-1/2 rounded-full bg-live/25 blur-2xl"
        />
      )}
      <span
        className={cn(
          "relative flex size-14 items-center justify-center rounded-2xl transition-transform duration-200 group-active:scale-90",
          accent
            ? "bg-gradient-to-br from-live to-live/80 text-live-foreground shadow-lg shadow-live/40"
            : "bg-foreground/[0.08] text-foreground ring-1 ring-inset ring-foreground/10",
        )}
      >
        <Icon className="size-6" strokeWidth={2.25} />
      </span>
      <span className="relative text-[15px] font-bold tracking-tight">{label}</span>
    </button>
  )
}
