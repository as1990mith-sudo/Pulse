// Client-safe types and constants for the Broadcast Centre. Separated from the
// data layer so client components can import them without pulling server-only
// db modules into the browser bundle.

export type Audience = "everyone" | "verified" | "active" | "admins"

export const AUDIENCES: { id: Audience; label: string; description: string }[] = [
  { id: "everyone", label: "Everyone", description: "All registered members" },
  { id: "verified", label: "Verified", description: "Members with a verified email" },
  { id: "active", label: "Active (30d)", description: "Members with a session in the last 30 days" },
  { id: "admins", label: "Admins", description: "Admin team members only" },
]

export type BroadcastStatus = "draft" | "scheduled" | "sent"

export type BroadcastRow = {
  id: string
  type: string
  title: string
  body: string
  audience: Audience
  status: BroadcastStatus
  scheduledFor: string | null
  sentAt: string | null
  createdAt: string
  channel: "in_app" | "push"
  recipientCount: number | null
}
