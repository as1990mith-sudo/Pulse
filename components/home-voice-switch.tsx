"use client"

import { Building2, User } from "lucide-react"
import { cn } from "@/lib/utils"

export type HomeVoice = { name: string; image: string | null; initials: string }

/**
 * Lets an admin of the active Home choose whether a post or comment speaks for
 * the organisation or for themselves.
 *
 * Deliberately label-only — no helper copy. The two options name the two
 * identities, which is the whole of what the user needs to know; a description
 * underneath would just restate the label. Renders nothing when `voice` is null,
 * so ordinary members never see an inert control.
 */
export function HomeVoiceSwitch({
  voice,
  asHome,
  onChange,
  personalName,
  size = "default",
  className,
}: {
  voice: HomeVoice | null
  asHome: boolean
  onChange: (asHome: boolean) => void
  /** The viewer's own name, shown as the personal option. */
  personalName: string
  /** `sm` fits inline comment boxes; `default` suits the main composer. */
  size?: "sm" | "default"
  className?: string
}) {
  if (!voice) return null

  const options = [
    { key: "home" as const, icon: Building2, label: voice.name, active: asHome },
    { key: "self" as const, icon: User, label: personalName, active: !asHome },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Post as"
      className={cn(
        "grid grid-cols-2 gap-1 rounded-full bg-secondary/60 p-1",
        size === "sm" ? "text-[11.5px]" : "text-[13px]",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="radio"
          aria-checked={opt.active}
          title={opt.label}
          onClick={() => onChange(opt.key === "home")}
          className={cn(
            "flex min-w-0 items-center justify-center gap-1.5 rounded-full font-semibold transition-colors",
            size === "sm" ? "px-2 py-1" : "px-3 py-1.5",
            opt.active
              ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <opt.icon className={cn("shrink-0", size === "sm" ? "size-3" : "size-3.5")} />
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
