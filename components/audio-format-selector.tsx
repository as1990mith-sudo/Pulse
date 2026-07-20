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
    hint: "Host-led broadcast",
  },
  {
    value: "conversation" as const,
    label: "Conversation",
    icon: Users,
    hint: "Everyone joins in",
  },
]

/**
 * Layout chooser shown at the top of the Audio Live setup screen. Podcast and
 * Conversation are two different live *experiences* (not a setting), so each is
 * a selectable card — mirroring the Video Live "Broadcast / Conversation" selector exactly
 * (compact, side-by-side, icon-over-label with a short hint).
 *
 * The two experiences render from separate consoles (StudioConsole vs
 * ConversationRoom), so picking the other layout navigates to that console's
 * setup at `/studio?mode=audio&layout=<format>`. The active card carries the
 * primary tint / ring; the inactive one is a calm glass card.
 */
export function AudioFormatSelector({ active }: { active: AudioFormat }) {
  const router = useRouter()

  function choose(value: AudioFormat) {
    if (value === active) return
    haptic("light")
    router.push(`/studio?mode=audio&layout=${value}`)
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Layout</span>
      <div className="grid grid-cols-2 gap-2">
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
                "flex flex-col items-center gap-1.5 rounded-2xl px-3 py-3 text-center ring-1 ring-inset transition-colors",
                isActive
                  ? "bg-primary/20 text-white ring-primary"
                  : "bg-white/5 text-white/70 ring-white/15 hover:bg-white/10",
              )}
            >
              <Icon className="size-5" />
              <span className="text-sm font-semibold leading-none">{opt.label}</span>
              <span className="text-[11px] leading-none text-white/50">{opt.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
