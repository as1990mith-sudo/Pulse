// Shared poll types, limits and pure helpers.
//
// These live here rather than in app/actions/polls.ts because a "use server"
// module may only export async functions — constants and synchronous helpers
// exported from one are a build error. Both the client composer and the server
// action import from this file, so the limits they enforce are the same values.

/** Hard caps, enforced on the server so a crafted request can't exceed them. */
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 6
export const POLL_MAX_OPTION_LENGTH = 80

/**
 * The durations offered when creating a poll. `hours: null` means "no closing
 * time", which is the deliberate default: most polls in a Home are open-ended.
 */
export const POLL_DURATIONS = [
  { id: "none", label: "No end date", hours: null },
  { id: "1d", label: "1 day", hours: 24 },
  { id: "3d", label: "3 days", hours: 72 },
  { id: "1w", label: "1 week", hours: 168 },
] as const

export type PollDurationId = (typeof POLL_DURATIONS)[number]["id"]

export type PollOptionView = {
  id: number
  label: string
  /**
   * Vote count, or null when results are being withheld from this viewer.
   * Withheld and zero are NOT the same thing, so this must stay nullable rather
   * than defaulting to 0 — the UI has to be able to tell them apart.
   */
  votes: number | null
}

export type PollView = {
  id: number
  allowMultiple: boolean
  /** Closing time in epoch ms, or null when the poll never closes. */
  closesAt: number | null
  closed: boolean
  /** The viewer's current choices. Empty means they have not voted yet. */
  votedOptionIds: number[]
  /** Total votes cast, or null when results are withheld. */
  totalVotes: number | null
  options: PollOptionView[]
}

/**
 * Validates and normalises poll options coming from a composer.
 *
 * Trims, drops blanks, and de-duplicates case-insensitively: two identical
 * options would split the vote for the same answer and make the result
 * meaningless, so this drops the duplicate rather than silently tallying both.
 */
export function normalizePollOptions(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of raw) {
    const label = value.trim().slice(0, POLL_MAX_OPTION_LENGTH)
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out.slice(0, POLL_MAX_OPTIONS)
}
