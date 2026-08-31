"use client"

import type { ComponentType } from "react"
import { cn } from "@/lib/utils"

type IconProps = { className?: string }

export type CallButtonTone = "glass" | "muted" | "accept" | "danger"

/**
 * A single circular call-control button used across the audio/video call
 * surfaces. Tones map to the action's meaning:
 *  - glass : an enabled, "on" control (mic on, camera on) — frosted glass
 *  - muted : a toggled-off / disabled-feel control (mic off, camera off) — solid white
 *  - accept: answer a call — green
 *  - danger: end / decline a call — red
 * `label` is retained as an accessibility/intent hint but is no longer rendered
 * beneath the button — the dock is icon-only for a cleaner, premium look (the
 * meaning is conveyed by `ariaLabel`).
 */
export function CallButton({
  icon: Icon,
  label,
  onClick,
  tone = "glass",
  size = "md",
  disabled = false,
  ariaLabel,
}: {
  icon: ComponentType<IconProps>
  label?: string
  onClick: () => void
  tone?: CallButtonTone
  size?: "md" | "lg"
  disabled?: boolean
  ariaLabel: string
}) {
  const dimensions = size === "lg" ? "size-[4.5rem]" : "size-14"
  const iconSize = size === "lg" ? "size-7" : "size-6"

  const tones: Record<CallButtonTone, string> = {
    glass:
      "bg-white/10 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md hover:bg-white/20 active:bg-white/25",
    muted: "bg-white text-neutral-900 ring-1 ring-inset ring-white/40 hover:bg-white/90 active:bg-white/80",
    accept:
      "bg-call-accept text-call-accept-foreground shadow-lg shadow-call-accept/40 hover:brightness-110 active:brightness-95",
    danger:
      "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/40 hover:brightness-110 active:brightness-95",
  }

  // `label` is intentionally unused for rendering (icon-only dock); `ariaLabel`
  // carries the accessible name.
  void label

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "flex items-center justify-center rounded-full transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
        "active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        dimensions,
        tones[tone],
      )}
    >
      <Icon className={iconSize} />
    </button>
  )
}
