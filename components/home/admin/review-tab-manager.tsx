"use client"

import { useState, useTransition } from "react"
import { Check } from "lucide-react"
import { updateReviewTabLabel } from "@/app/actions/home"
import { REVIEW_TAB_OPTIONS, type ReviewTabLabel } from "@/lib/home/types"
import { cn } from "@/lib/utils"

// A short blurb per option so admins understand the tone each name sets. The
// choice is cosmetic — it only renames the tab, never its behaviour.
const OPTION_HINTS: Record<ReviewTabLabel, string> = {
  Testimonials: "Members share stories of what they've experienced.",
  "Praise Reports": "A place for answered prayers and things to celebrate.",
  Feedback: "A neutral name for reflections and responses.",
}

export function ReviewTabManager({ handle, current }: { handle: string; current: ReviewTabLabel }) {
  const [selected, setSelected] = useState<ReviewTabLabel>(current)
  const [pending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)

  function choose(label: ReviewTabLabel) {
    if (label === selected) return
    const previous = selected
    setSelected(label)
    startTransition(async () => {
      try {
        await updateReviewTabLabel(handle, label)
        setSavedAt(Date.now())
      } catch {
        // Roll back to the last known-good choice if the save fails.
        setSelected(previous)
      }
    })
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-3" disabled={pending}>
        <legend className="sr-only">Reviews tab name</legend>
        {REVIEW_TAB_OPTIONS.map((label) => {
          const active = label === selected
          return (
            <button
              key={label}
              type="button"
              onClick={() => choose(label)}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-muted-foreground/40",
              )}
            >
              <span className="space-y-1">
                <span className="block font-display text-base font-semibold">{label}</span>
                <span className="block text-sm text-muted-foreground">{OPTION_HINTS[label]}</span>
              </span>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                )}
              >
                {active && <Check className="size-4" />}
              </span>
            </button>
          )
        })}
      </fieldset>

      <p className="text-sm" aria-live="polite">
        <span className="text-muted-foreground">Your reviews tab currently shows </span>
        <span className="font-semibold text-foreground">{selected}</span>
        <span className="text-muted-foreground">
          {pending ? " — saving…" : savedAt ? " — saved." : "."}
        </span>
      </p>
    </div>
  )
}
