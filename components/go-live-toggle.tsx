"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Mic, Radio, Users, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"

type Mode = "audio" | "video"
type AudioLayout = "podcast" | "conversation"

/**
 * Immersive "Go live" entry point for the Live tab. A glassy segmented control
 * lets the host pick Audio or Video before opening the studio in that mode
 * (`/studio?mode=audio|video`). The active segment slides under the selection
 * and is filled with the skin accent.
 */
export function GoLiveToggle() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("video")
  const [audioLayout, setAudioLayout] = useState<AudioLayout>("podcast")

  const openStudio = () => {
    haptic("medium")
    const params = new URLSearchParams({ mode })
    if (mode === "audio") params.set("layout", audioLayout)
    router.push(`/studio?${params.toString()}`)
  }

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
            Broadcast a live audio room or a full-screen video stream.
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
                "relative z-10 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-200",
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
                "relative z-10 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-200",
                mode === "audio" ? "text-live-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Mic className="size-4" /> Audio Live
            </button>
          </div>

          <button
            type="button"
            onClick={openStudio}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-live px-6 py-3 font-semibold text-live-foreground transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {mode === "video" ? <Video className="size-4 shrink-0" /> : <Mic className="size-4 shrink-0" />}
            <span className="whitespace-nowrap">
              {mode === "video" ? "Open the video studio" : `Start ${audioLayout === "podcast" ? "a podcast" : "a conversation"}`}
            </span>
            <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Audio Live sub-choice: Podcast vs Conversation. Only shown for audio. */}
        {mode === "audio" && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Choose your format</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={audioLayout === "podcast"}
                onClick={() => setAudioLayout("podcast")}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
                  audioLayout === "podcast"
                    ? "border-live/60 bg-live/10 ring-1 ring-live/40"
                    : "border-border/60 bg-secondary/40 hover:border-border",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    audioLayout === "podcast" ? "bg-live text-live-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  <Radio className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Podcast</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground text-pretty">
                    You host, with guests and a listening audience. A broadcast studio.
                  </span>
                </span>
              </button>

              <button
                type="button"
                aria-pressed={audioLayout === "conversation"}
                onClick={() => setAudioLayout("conversation")}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
                  audioLayout === "conversation"
                    ? "border-live/60 bg-live/10 ring-1 ring-live/40"
                    : "border-border/60 bg-secondary/40 hover:border-border",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    audioLayout === "conversation"
                      ? "bg-live text-live-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  <Users className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Conversation</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground text-pretty">
                    Everyone can speak together. A calm community gathering.
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
