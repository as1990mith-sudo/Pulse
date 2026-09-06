"use client"

import { cn } from "@/lib/utils"
import { getAvatarColor, getInitials } from "@/lib/identity"

/**
 * The premium audio-only layout for an appointment call, shown whenever neither
 * participant has a camera on (so the call is never a black canvas). A warm
 * brand-gradient field carries both participants' avatar discs with an animated
 * "speaking" ring, their names, and a live timer. Used in BOTH the full-screen
 * call and the minimized PiP window (via `compact`).
 */
export function AppointmentAudioStage({
  selfName,
  counterpartName,
  selfSpeaking,
  counterpartSpeaking,
  counterpartPresent,
  elapsedLabel,
  compact = false,
}: {
  selfName: string
  counterpartName: string
  selfSpeaking: boolean
  counterpartSpeaking: boolean
  counterpartPresent: boolean
  elapsedLabel: string
  compact?: boolean
}) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 50% 12%, color-mix(in oklch, var(--primary) 40%, transparent), transparent 60%), radial-gradient(80% 60% at 50% 100%, color-mix(in oklch, var(--primary) 20%, transparent), transparent 65%), linear-gradient(180deg, #0c0c0f, #050506)",
        }}
      />

      <div className={cn("relative flex items-center justify-center", compact ? "gap-3" : "gap-6")}>
        <Avatar name={counterpartName} speaking={counterpartSpeaking && counterpartPresent} compact={compact} dim={!counterpartPresent} />
        {!compact && <Avatar name={selfName} speaking={selfSpeaking} compact={compact} />}
      </div>

      {!compact && (
        <div className="relative mt-8 flex flex-col items-center gap-1 text-center">
          <p className="text-lg font-semibold text-white">{counterpartPresent ? counterpartName : `Waiting for ${counterpartName}…`}</p>
          <p className="text-sm tabular-nums text-white/60">{elapsedLabel}</p>
        </div>
      )}
    </div>
  )
}

function Avatar({
  name,
  speaking,
  compact,
  dim = false,
}: {
  name: string
  speaking: boolean
  compact: boolean
  dim?: boolean
}) {
  const size = compact ? "size-14" : "size-28"
  const text = compact ? "text-lg" : "text-3xl"
  return (
    <div className="relative flex items-center justify-center">
      {speaking && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full ring-2 ring-primary/70 animate-ping",
            compact ? "scale-110" : "scale-105",
          )}
        />
      )}
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full font-semibold text-white shadow-xl ring-2 transition-all duration-300",
          size,
          text,
          getAvatarColor(name),
          speaking ? "ring-primary" : "ring-white/15",
          dim && "opacity-60",
        )}
      >
        {getInitials(name)}
      </span>
    </div>
  )
}
