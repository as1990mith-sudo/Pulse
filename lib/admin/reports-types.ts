// Client-safe types and constants for the moderation module.
// IMPORTANT: this file must never import "@/lib/db" (pg) or any server-only
// module, because it is imported by client components.

export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed"

export type ContentSnapshot = {
  found: boolean
  authorId: string | null
  authorName: string | null
  title: string | null
  excerpt: string | null
  createdAt: string | null
  state: "visible" | "hidden" | "removed"
}

export type ReportRow = {
  id: string
  contentType: string
  contentId: string
  reporterId: string | null
  reason: string
  details: string | null
  status: ReportStatus
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  reportCount: number
  content: ContentSnapshot
}

/** Human labels for the content types we support in the queue. */
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  feed_post: "Feed Post",
  feed_comment: "Feed Comment",
  article: "Article",
  article_comment: "Article Comment",
  episode: "Episode",
  community_post: "Community Post",
  user: "User",
}
