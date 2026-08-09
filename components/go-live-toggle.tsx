"use client"

import { useRouter } from "next/navigation"
import { Mic, Video } from "lucide-react"
import { haptic } from "@/lib/haptics"

/**
 * Decorative equalizer that sits behind the Go-live actions. Bars fade from a
 * deep to a bright red — a single accent for the whole Live tab. The heights
 * come from a fixed pattern so the SSR/CSR markup matches (no random).
 */
function GoLiveWaveform() {
  // A pleasing, non-random pattern of relative bar heights (0–1).
  const bars = [
    0.35, 0.55, 0.28, 0.7, 0.42, 0.9, 0.5, 0.33, 0.62, 0.8, 0.45, 0.6, 0.3, 0.75, 0.5, 0.38, 0.68, 0.85, 0.4, 0.58,
    0.32, 0.72, 0.48, 0.9, 0.55, 0.36, 0.64, 0.78, 0.44, 0.6, 0.3, 0.5, 0.7, 0.4, 0.82, 0.52, 0.34, 0.66, 0.46, 0.6,
  ]
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 flex h-28 items-end justify-between gap-[3px] px-6 opacity-70"
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className="flex-1 rounded-full bg-gradient-to-t from-live/80 to-live/40"
          style={{ height: `${Math.round(h * 100)}%` }}
        />
      ))}
    </div>
  )
}

/**
 * The flagship "Go live" panel on the Live tab. A red-glow bordered hero with a
 * big display headline and two large actions — a filled "Video live" and an
 * outlined "Audio live" — layered over a warm waveform. Each button opens the
 * studio directly in that mode (`/studio?mode=video|audio`).
 */
export function GoLiveHero() {
  const router = useRouter()

  const go = (mode: "video" | "audio") => {
    haptic("medium")
    router.push(`/studio?mode=${mode}`)
  }

  return (
    <section className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-live/30 bg-card">
      {/* Ambient red glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-16 -top-20 size-64 rounded-full bg-live/20 blur-3xl"
      />
      <GoLiveWaveform />

      <div className="relative flex h-full flex-col p-5 sm:p-7">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-live">
          <span className="size-2 rounded-full bg-live" />
          Go live
        </span>

        <h2 className="mt-4 max-w-[14ch] text-balance text-[clamp(1.75rem,8vw,3rem)] font-extrabold leading-[0.98] tracking-tight">
          Your audience is waiting on frequency.
        </h2>

        {/* mt-auto pins the actions to the bottom of the (flexible) panel. */}
        <div className="mt-auto flex items-stretch gap-3 pt-6">
          <button
            type="button"
            onClick={() => go("video")}
            className="group flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-live px-5 py-3.5 text-base font-bold text-live-foreground shadow-lg shadow-live/25 transition-all hover:opacity-95 active:scale-[0.98]"
          >
            <Video className="size-5 shrink-0" />
            Video live
          </button>
          <button
            type="button"
            onClick={() => go("audio")}
            className="group flex flex-1 items-center justify-center gap-2.5 rounded-2xl border border-border/70 bg-background/40 px-5 py-3.5 text-base font-bold text-foreground backdrop-blur transition-all hover:border-border hover:bg-background/60 active:scale-[0.98]"
          >
            <Mic className="size-5 shrink-0" />
            Audio live
          </button>
        </div>
      </div>
    </section>
  )
}
