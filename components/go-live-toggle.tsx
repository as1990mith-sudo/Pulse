"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Mic, Video } from "lucide-react"
import { cn } from "@/lib/utils"

type Mode = "audio" | "video"

/**
 * Immersive "Go live" entry point for the Live tab. A glassy segmented control
 * lets the host pick Audio or Video before opening the studio in that mode
 * (`/studio?mode=audio|video`). The active segment slides under the selection
 * and is filled with the skin accent.
 */
export function GoLiveToggle() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("video")

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
      {/* Ambient accent glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-live/20 blur-3xl"
      />
      <div className="relative flex flex-col gap-8 p-8 md:p-12">
        <div className="max-w-xl space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-live">Go live</span>
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Your audience is waiting. Choose how you want to go on air.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Broadcast a live audio room or a full-screen video stream. Either way, your followers get notified and can
            join the chat, send reactions, and gift in real time.
          </p>
        </div>

        {/* Segmented mode toggle */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Choose live mode"
            className="relative grid w-full max-w-sm grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-secondary/50 p-1 backdrop-blur"
          >
            {/* Sliding active indicator */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-xl bg-live shadow-lg shadow-live/30 transition-transform duration-300 ease-out",
                mode === "video" ? "translate-x-0" : "translate-x-[calc(100%+0.25rem)]",
              )}
            />
            <button
              type="button"
              role="tab"
              aria-selected={mode === "video"}
              onClick={() => setMode("video")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-200",
                mode === "video" ? "text-live-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Video className="size-4" /> Video Live
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "audio"}
              onClick={() => setMode("audio")}
              className={cn(
                "relative z-10 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-200",
                mode === "audio" ? "text-live-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Mic className="size-4" /> Audio Live
            </button>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/studio?mode=${mode}`)}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-live px-6 py-3 font-semibold text-live-foreground transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {mode === "video" ? <Video className="size-4 shrink-0" /> : <Mic className="size-4 shrink-0" />}
            <span className="whitespace-nowrap">Open the {mode} studio</span>
            <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </section>
  )
}
