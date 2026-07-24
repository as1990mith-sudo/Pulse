// Client-safe types and constants for the Devotionals admin module.
// Kept separate from the data layer so client components can import labels and
// types without pulling the server-only `pg`/db modules into the browser bundle.

export type DevotionalStatus = "draft" | "scheduled" | "published" | "archived"

export const DEVOTIONAL_STATUSES: DevotionalStatus[] = ["published", "scheduled", "draft", "archived"]

export const DEVOTIONAL_STATUS_LABELS: Record<DevotionalStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
}

export type DevotionalRow = {
  id: number
  title: string
  verseRef: string
  verse: string
  body: string
  prayer: string
  cover: string | null
  readingMinutes: number
  publishDate: string
  status: DevotionalStatus
  scheduledFor: string | null
  createdAt: string
  lastPostedAt: string
  isLive: boolean
  commentCount: number
}
