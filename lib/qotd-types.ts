// Client-safe types and constants for the Question of the Day module.
// Kept separate from the data layer so client components can import labels and
// types without pulling the server-only db modules into the browser bundle.

export type QotdStatus = "draft" | "scheduled" | "published" | "archived"

export const QOTD_STATUSES: QotdStatus[] = ["published", "scheduled", "draft", "archived"]

export const QOTD_STATUS_LABELS: Record<QotdStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
}

/** The channel key a question's response discussion lives under in feed_post. */
export function qotdChannel(questionId: number): string {
  return `qotd:${questionId}`
}

export type QotdQuestionRow = {
  id: number
  questionText: string
  image: string | null
  status: QotdStatus
  activeDate: string
  scheduledFor: string | null
  publishedAt: string | null
  createdAt: string
  // True when this is the single live/featured question shown to users.
  isLive: boolean
  // Number of responses in this question's discussion thread.
  responseCount: number
}
