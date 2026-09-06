"use client"

// A bottom sheet that lists the device's available microphone inputs (built-in,
// Bluetooth, wired/USB headset, etc.) and lets the participant choose which one
// the live meeting uses — without leaving or restarting the meeting. The chosen
// source is applied via LiveKit's switchActiveDevice and persisted by the audio
// hook, so it stays stable and is re-applied across reconnects. Only inputs the
// OS actually exposes to the browser appear here; the current one is checked.

import { useCallback, useEffect, useState } from "react"
import { Check, Mic } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type MicDevice = { deviceId: string; label: string }

/** Gives an unlabeled input (labels are hidden until mic permission) a sane name. */
function labelFor(d: MediaDeviceInfo, index: number): string {
  if (d.label) return d.label
  if (d.deviceId === "default") return "Default microphone"
  return `Microphone ${index + 1}`
}

export function MicSourceSheet({
  open,
  onOpenChange,
  activeDeviceId,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeDeviceId: string | null
  onSelect: (deviceId: string) => void
}) {
  const [devices, setDevices] = useState<MicDevice[]>([])

  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all
        .filter((d) => d.kind === "audioinput")
        // Drop the synthetic "communications" duplicate some platforms list.
        .filter((d) => d.deviceId && d.deviceId !== "communications")
        .map((d, i) => ({ deviceId: d.deviceId, label: labelFor(d, i) }))
      setDevices(inputs)
    } catch {
      setDevices([])
    }
  }, [])

  // Refresh on open and whenever the set of devices changes (a headset is
  // plugged in / a Bluetooth mic connects while the sheet is showing).
  useEffect(() => {
    if (!open) return
    void refresh()
    const md = navigator.mediaDevices
    md?.addEventListener?.("devicechange", refresh)
    return () => md?.removeEventListener?.("devicechange", refresh)
  }, [open, refresh])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-white/10 bg-zinc-900/95 text-white backdrop-blur-xl">
        <SheetHeader className="px-4">
          <SheetTitle className="text-white">Microphone</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1.5 px-4 pb-2">
          {devices.length === 0 && (
            <p className="py-6 text-center text-sm text-white/50">No microphones detected.</p>
          )}
          {devices.map((d) => {
            // "default" matches whatever the OS default currently is.
            const active = activeDeviceId ? d.deviceId === activeDeviceId : d.deviceId === "default"
            return (
              <button
                key={d.deviceId}
                type="button"
                onClick={() => {
                  onSelect(d.deviceId)
                  onOpenChange(false)
                }}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors",
                  active ? "bg-primary/15 ring-1 ring-inset ring-primary/40" : "bg-white/5 hover:bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    active ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70",
                  )}
                >
                  <Mic className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.label}</span>
                {active && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
        <p className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-center text-[11px] leading-relaxed text-white/40">
          Your choice stays put for the whole meeting. If it disconnects, we fall back to another mic and update this.
        </p>
      </SheetContent>
    </Sheet>
  )
}
