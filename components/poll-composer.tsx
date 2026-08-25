"use client"

import { useState } from "react"
import { Plus, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Longest a single option label may be, matched to the server's own cap. */
const MAX_OPTION_LEN = 80
/** Upper bound on options. Beyond this a poll stops being scannable. */
export const MAX_OPTIONS = 6
/** Lower bound: a "poll" with one answer isn't a question. */
export const MIN_OPTIONS = 2

/**
 * What the composer hands back to `createPost`. Deliberately the same shape the
 * server action accepts, so there is no translation layer to drift.
 */
export type PollDraft = {
  options: string[]
  allowMultiple: boolean
  /** Null means "never closes". */
  durationHours: number | null
}

/** Blank draft — two empty options, since that's the minimum a poll needs. */
export function emptyPollDraft(): PollDraft {
  return { options: ["", ""], allowMultiple: false, durationHours: null }
}

/**
 * Counts options that would actually survive submission, so the parent can
 * enable/disable Post using the same rule the server enforces.
 */
export function countUsablePollOptions(draft: PollDraft): number {
  const seen = new Set<string>()
  for (const o of draft.options) {
    const t = o.trim()
    if (t) seen.add(t.toLowerCase())
  }
  return seen.size
}

const DURATIONS: { label: string; hours: number | null }[] = [
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
  { label: "No limit", hours: null },
]

/**
 * Poll builder shown inside the composer, below the question textarea.
 *
 * The post's own text is the question, so this only collects the answers and
 * the two rules that can't be changed later (multi-select and closing time).
 */
export function PollComposer({
  draft,
  onChange,
  onRemove,
}: {
  draft: PollDraft
  onChange: (next: PollDraft) => void
  onRemove: () => void
}) {
  // Tracks which option input was just added so it can take focus, letting an
  // author add several options from the keyboard without reaching for the mouse.
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  function setOption(i: number, value: string) {
    const options = [...draft.options]
    options[i] = value.slice(0, MAX_OPTION_LEN)
    onChange({ ...draft, options })
  }

  function addOption() {
    if (draft.options.length >= MAX_OPTIONS) return
    onChange({ ...draft, options: [...draft.options, ""] })
    setFocusIndex(draft.options.length)
  }

  function removeOption(i: number) {
    // Keep MIN_OPTIONS rows on screen: clear the last ones rather than deleting,
    // so the form can never reach a state it isn't allowed to submit from.
    if (draft.options.length <= MIN_OPTIONS) {
      setOption(i, "")
      return
    }
    onChange({ ...draft, options: draft.options.filter((_, idx) => idx !== i) })
  }

  return (
    <section aria-label="Poll" className="rounded-xl border border-border bg-muted/30 p-3">
      <header className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Poll</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          Remove
        </Button>
      </header>

      <ul className="space-y-2">
        {draft.options.map((option, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              value={option}
              autoFocus={focusIndex === i}
              onChange={(e) => setOption(i, e.target.value)}
              onKeyDown={(e) => {
                // Enter moves to the next option instead of submitting the post,
                // which is almost never what you want mid-way through a poll.
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  if (i === draft.options.length - 1) addOption()
                  else setFocusIndex(i + 1)
                }
              }}
              placeholder={`Option ${i + 1}`}
              aria-label={`Poll option ${i + 1}`}
              className="h-9 bg-background text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeOption(i)}
              // Disabled only when there is nothing to clear, so the control
              // never looks actionable while doing nothing.
              disabled={draft.options.length <= MIN_OPTIONS && !option}
              aria-label={`Remove option ${i + 1}`}
              className="size-9 shrink-0 text-muted-foreground"
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {draft.options.length < MAX_OPTIONS && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addOption}
          className="mt-2 h-8 gap-1.5 px-2 text-xs text-primary"
        >
          <Plus className="size-3.5" />
          Add option
        </Button>
      )}

      <div className="mt-3 space-y-3 border-t border-border pt-3">
        {/* Multi-select. A checkbox-style toggle rather than a switch to match
            the fact that it describes how the poll is answered, not a setting. */}
        <button
          type="button"
          onClick={() => onChange({ ...draft, allowMultiple: !draft.allowMultiple })}
          aria-pressed={draft.allowMultiple}
          className="flex w-full items-center gap-2.5 text-left"
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
              draft.allowMultiple ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
            )}
          >
            {draft.allowMultiple && <Check className="size-3.5" />}
          </span>
          <span className="text-sm text-foreground">Allow multiple answers</span>
        </button>

        {/* Closing time. Segmented because there are only four choices and they
            are mutually exclusive — a dropdown would hide the default. */}
        <div>
          <span className="mb-1.5 block text-xs text-muted-foreground">Closes after</span>
          <div role="radiogroup" aria-label="Poll duration" className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => {
              const active = draft.durationHours === d.hours
              return (
                <button
                  key={d.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ ...draft, durationHours: d.hours })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
