"use client"

import { useState, useTransition } from "react"
import { Check, Loader2 } from "lucide-react"
import { castPollVote } from "@/app/actions/polls"
import type { PollView } from "@/lib/polls"
import { cn } from "@/lib/utils"

/** "2 days left" / "Closed" / "" — the poll's remaining-time label. */
function closingLabel(closesAt: number | null, closed: boolean): string {
  if (closed) return "Final results"
  if (closesAt === null) return ""
  const ms = closesAt - Date.now()
  if (ms <= 0) return "Final results"
  const hours = Math.round(ms / 3_600_000)
  if (hours < 1) return "Less than an hour left"
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} left`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? "day" : "days"} left`
}

/**
 * A poll attached to a feed post. The post's text is the question, so this
 * renders only the options and the tally.
 *
 * Results are withheld by the server until the viewer votes, which is why
 * `votes` is nullable: null means "not yours to see yet", NOT zero. Voting
 * swaps the buttons for bars in place, so the answer appears where the option
 * the reader just tapped already was.
 */
export function PollCard({
  poll,
  canVote,
  onVoted,
}: {
  poll: PollView
  /** False when signed out or the poll has closed; options render read-only. */
  canVote: boolean
  onVoted?: () => void
}) {
  // Optimistic local copy of the viewer's selection so the UI responds on tap
  // rather than after the round-trip.
  const [selected, setSelected] = useState<number[]>(poll.votedOptionIds)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const voted = selected.length > 0
  const interactive = canVote && !poll.closed
  // The server only sends counts once the viewer is allowed to see them, so a
  // non-null `votes` is the signal that results have been released.
  const serverRevealed = poll.options.some((o) => o.votes !== null)
  // Show results as soon as the viewer votes — but until the refetch lands the
  // server has sent no counts, so `poll.totalVotes` is still null. Deriving the
  // total from the selection in that window keeps the just-cast vote visible;
  // reading totalVotes directly would divide by 0 and render every bar at 0%.
  const showResults = serverRevealed || voted
  const total = serverRevealed ? (poll.totalVotes ?? 0) : selected.length
  const label = closingLabel(poll.closesAt, poll.closed)

  function submit(next: number[]) {
    setSelected(next)
    setError(null)
    startTransition(async () => {
      try {
        await castPollVote({ pollId: poll.id, optionIds: next })
        onVoted?.()
      } catch (err) {
        // Put the previous selection back: showing a vote that didn't persist
        // is worse than showing none.
        setSelected(poll.votedOptionIds)
        setError(err instanceof Error ? err.message : "Could not save your vote.")
      }
    })
  }

  function toggle(optionId: number) {
    if (!interactive) return
    if (poll.allowMultiple) {
      submit(selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId])
    } else {
      // Single-choice: tapping the current answer withdraws it, so a voter is
      // never locked into a choice they made by accident.
      submit(selected.includes(optionId) ? [] : [optionId])
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {poll.options.map((option) => {
          const isSelected = selected.includes(option.id)
          // Before the refetch, the only vote this client knows about is the
          // viewer's own — so count that and treat the rest as 0 rather than
          // showing a stale or empty tally.
          const votes = serverRevealed ? (option.votes ?? 0) : isSelected ? 1 : 0
          const pct = total > 0 ? Math.round((votes / total) * 100) : 0
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => toggle(option.id)}
                disabled={!interactive || pending}
                aria-pressed={isSelected}
                className={cn(
                  "w-full rounded-xl border px-3.5 py-3 text-left transition-colors",
                  isSelected ? "border-primary bg-primary/5" : "border-border",
                  interactive && !pending && "hover:border-primary/60",
                  !interactive && "cursor-default",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                    <span className={cn("truncate text-sm text-foreground", isSelected && "font-semibold")}>
                      {option.label}
                    </span>
                  </span>
                  {showResults && (
                    <span
                      className={cn(
                        "shrink-0 text-xs font-bold tabular-nums",
                        isSelected ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {pct}%
                    </span>
                  )}
                </span>
                {/* Result bar: a full-width track with a 100% solid, deep accent
                    fill so tallies read as active brand colour, not a pale tint.
                    Sitting under the label keeps every value legible in light or
                    dark mode regardless of how full the bar is. */}
                {showResults && (
                  <span aria-hidden className="mt-2.5 block h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {pending && <Loader2 className="size-3 animate-spin" />}
        {showResults ? (
          <span>
            {total} {total === 1 ? "vote" : "votes"}
          </span>
        ) : (
          <span>{interactive ? "Vote to see the results" : "No votes yet"}</span>
        )}
        {label && <span aria-hidden>·</span>}
        {label && <span>{label}</span>}
        {poll.allowMultiple && !poll.closed && (
          <>
            <span aria-hidden>·</span>
            <span>Pick as many as you like</span>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
