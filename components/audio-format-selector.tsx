"use client"

import { useRouter } from "next/navigation"
import { Mic, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"

export type AudioFormat = "podcast" | "conversation"

const OPTIONS = [
  {
    value: "podcast" as const,
    label: "Podcast",
    icon: Mic,
    description: "Host-led broadcast with guests and a listening audience. A professional audio studio.",
  },
  {
    value: "conversation" as const,
    label: "Conversation",
    icon: Users,
    description: "Everyone can participate together. A community discussion room.",
  },
]

/**
 * Format chooser shown at the top of the Audio Live setup screen. Podcast and
 * Conversation are two different live *experiences* (not a setting), so each is
 * a large selectable card — mirroring the Video Live "Focused / Grid" selector.
 *
 * The two experiences render from separate consoles (StudioConsole vs
 * ConversationRoom), so picking the other format navigates to that console's
 * setup at `/studio?mode=audio&layout=<format>`. The active card carries the
 * glowing red border / tint; the inactive one is a calm glass card.
 */
export function AudioFormatSelector({ active }: { active: AudioFormat }) {
  const router = useRouter()

  function choose(value: AudioFormat) {
    if (value === active) return
    haptic("light")
    router.push(`/studio?mode=audio&layout=${value}`)
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-white">Format</span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const isActive = active === opt.value
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => choose(opt.value)}
              aria-pressed={isActive}
              className={cn(
                "flex flex-col items-start gap-2.5 rounded-2xl p-4 text-left ring-1 ring-inset transition-all active:scale-[0.99]",
                isActive
                  ? "bg-primary/15 text-white shadow-lg shadow-primary/30 ring-2 ring-primary"
                  : "bg-white/[0.04] text-white/70 ring-white/10 hover:bg-white/[0.08]",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/60",
                )}
              >
                <Icon className="size-5" strokeWidth={2.25} />
              </span>
              <span className="text-sm font-bold leading-none text-white">{opt.label}</span>
              <span className="text-pretty text-xs leading-relaxed text-white/55">{opt.description}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
