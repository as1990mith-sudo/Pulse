"use client"

import { useState } from "react"
import { Bluetooth, Check, Ear, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAudioOutput, type AudioOutputRoute } from "@/lib/audio-output"

const ROUTES: { value: AudioOutputRoute; label: string; hint: string; icon: typeof Volume2 }[] = [
  { value: "speaker", label: "Speaker", hint: "Play out loud through the main speaker", icon: Volume2 },
  { value: "earpiece", label: "Earpiece", hint: "Hold to your ear like a phone call", icon: Ear },
  { value: "bluetooth", label: "Bluetooth", hint: "Route to a connected Bluetooth device", icon: Bluetooth },
]

/** Icon for a route — lets dock-based consoles show the current selection. */
export function audioRouteIcon(route: AudioOutputRoute): typeof Volume2 {
  return ROUTES.find((r) => r.value === route)?.icon ?? Volume2
}

/**
 * The Audio Output chooser body (Speaker / Earpiece / Bluetooth) as a bottom
 * sheet. Controlled, so any console can drive it from its own dock button.
 * The choice is a sticky preference (see `lib/audio-output.ts`) — Frequency
 * never changes it automatically.
 */
export function AudioOutputSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { route, bluetoothConnected, isNative, setRoute } = useAudioOutput()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // z-[80] clears the live-meeting surfaces (z-60) this sheet is opened
        // from; without it the sheet renders behind the meeting and looks like
        // it never opened. Overlay raised in lockstep so tap-outside dismiss works.
        className="z-[80] mx-auto max-w-md rounded-t-3xl border-white/10 bg-zinc-950/95 text-white backdrop-blur-2xl"
        overlayClassName="z-[80]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-base font-semibold text-white">Audio output</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-1.5 px-4 pb-2">
          {ROUTES.map((opt) => {
            const active = route === opt.value
            const Icon = opt.icon
            const isBt = opt.value === "bluetooth"
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setRoute(opt.value)
                  onOpenChange(false)
                }}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                  active ? "border-primary/40 bg-primary/15" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    active ? "bg-primary/25 text-primary" : "bg-white/10 text-white/70",
                  )}
                >
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{opt.label}</span>
                    {isBt && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          bluetoothConnected ? "bg-primary/20 text-primary" : "bg-white/10 text-white/40",
                        )}
                      >
                        {bluetoothConnected ? "Connected" : "Not detected"}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/45">{opt.hint}</span>
                </span>
                {active && <Check className="size-5 shrink-0 text-primary" strokeWidth={2.5} />}
              </button>
            )
          })}
        </div>

        {/* Honest note when there is no native shell to actuate the route: the
            browser can't force the phone's speaker/earpiece/Bluetooth, so the
            device decides the exact path while the preference is remembered. */}
        {!isNative && (
          <p className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-center text-[11px] leading-relaxed text-white/40">
            On this device the system controls the exact route. Your preference is saved and a connected Bluetooth or
            wired device is used automatically.
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Self-contained Audio Output control: a round button showing the current
 * route that opens {@link AudioOutputSheet}. For live surfaces without a
 * bespoke dock-button system (listener, viewer overlays).
 */
export function AudioOutputControl({
  size = "md",
  className,
}: {
  size?: "sm" | "md"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const { route } = useAudioOutput()
  const TriggerIcon = audioRouteIcon(route)

  const dimension = size === "sm" ? "size-10" : "size-12"
  const iconSize = size === "sm" ? "size-4" : "size-5"

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Audio output: ${route}`}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white/80 shadow-lg shadow-black/30 backdrop-blur-xl transition-colors hover:bg-white/15 hover:text-white supports-[backdrop-filter]:bg-white/[0.08]",
          dimension,
          className,
        )}
      >
        <TriggerIcon className={iconSize} strokeWidth={2} />
      </button>
      <AudioOutputSheet open={open} onOpenChange={setOpen} />
    </>
  )
}
