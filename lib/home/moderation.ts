// Client-safe domain model for Home moderation (Reports + member discipline).
//
// This is the single source of truth for the vocabulary of the Home-LEVEL
// moderation system: report reasons, statuses, resolutions, suspension
// durations, and the view shapes shared between the server actions
// (app/actions/home-reports.ts) and the UI. It imports nothing server-only.
//
// Governance boundary: everything here is scoped to a single Home. None of it
// is a platform/global record — a Home only ever sees its own reports and its
// own moderation history. Frequency Support is an entirely separate system.

// ── Report reasons (compact, appropriate categories) ─────────────────────────
export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "violence"
  | "nudity"
  | "misinformation"
  | "self_harm"
  | "impersonation"
  | "other"

export const REPORT_REASONS: { id: ReportReason; label: string; hint: string }[] = [
  { id: "spam", label: "Spam or scam", hint: "Unwanted promotion, fraud or repetitive content." },
  { id: "harassment", label: "Harassment or bullying", hint: "Targeted abuse, threats or intimidation." },
  { id: "hate", label: "Hate speech", hint: "Attacks based on identity or protected traits." },
  { id: "violence", label: "Violence", hint: "Threats or glorification of violence." },
  { id: "nudity", label: "Nudity or sexual content", hint: "Explicit or inappropriate material." },
  { id: "misinformation", label: "False information", hint: "Misleading or deceptive claims." },
  { id: "self_harm", label: "Self-harm", hint: "Content promoting self-harm or suicide." },
  { id: "impersonation", label: "Impersonation", hint: "Pretending to be someone else." },
  { id: "other", label: "Something else", hint: "Anything not covered above." },
]

export function reportReasonLabel(id: string): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? "Reported"
}

// ── Target ───────────────────────────────────────────────────────────────────
export type ReportTargetType = "member" | "post" | "comment"

export const REPORT_TARGET_LABEL: Record<ReportTargetType, string> = {
  member: "Member",
  post: "Post",
  comment: "Comment",
}

// ── Status ─────────────────────────────────────────────────────────────────��─
export type ReportStatus = "pending" | "under_review" | "resolved"

export const REPORT_STATUSES: { id: ReportStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "under_review", label: "Under Review" },
  { id: "resolved", label: "Resolved" },
]

export const REPORT_STATUS_META: Record<
  ReportStatus,
  { label: string; dot: string; text: string; chip: string }
> = {
  pending: {
    label: "Pending",
    dot: "bg-amber-400",
    text: "text-amber-300",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  },
  under_review: {
    label: "Under Review",
    dot: "bg-sky-400",
    text: "text-sky-300",
    chip: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  },
  resolved: {
    label: "Resolved",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  },
}

// ── Resolution (recorded when a report is resolved) ──────────────────────────
export type ReportResolution =
  | "no_action"
  | "warning"
  | "content_removed"
  | "member_suspended"
  | "member_removed"

export const REPORT_RESOLUTIONS: { id: ReportResolution; label: string; hint: string }[] = [
  { id: "no_action", label: "No action", hint: "Reviewed — nothing further needed." },
  { id: "warning", label: "Warning", hint: "Warn the member about their conduct." },
  { id: "content_removed", label: "Content removed", hint: "Take down the reported post or comment." },
  { id: "member_suspended", label: "Member suspended", hint: "Pause the member's participation for a while." },
  { id: "member_removed", label: "Member removed", hint: "Remove the member from this Home." },
]

export function reportResolutionLabel(id: string | null | undefined): string {
  if (!id) return ""
  return REPORT_RESOLUTIONS.find((r) => r.id === id)?.label ?? id
}

// ── Suspension durations ─────────────────────────────────────────────────────
export type SuspensionDurationId = "12h" | "24h" | "72h" | "7d" | "21d" | "indefinite"

export const SUSPENSION_DURATIONS: { id: SuspensionDurationId; label: string; hours: number | null }[] = [
  { id: "12h", label: "12 hours", hours: 12 },
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "72h", label: "72 hours", hours: 72 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
  { id: "21d", label: "21 days", hours: 24 * 21 },
  { id: "indefinite", label: "Indefinitely", hours: null },
]

/** Resolve a duration id to an expiry Date (or null for indefinite). */
export function suspensionExpiry(id: SuspensionDurationId, from: Date = new Date()): Date | null {
  const d = SUSPENSION_DURATIONS.find((x) => x.id === id)
  if (!d || d.hours == null) return null
  return new Date(from.getTime() + d.hours * 60 * 60 * 1000)
}

export function suspensionDurationLabel(id: string): string {
  return SUSPENSION_DURATIONS.find((x) => x.id === id)?.label ?? id
}

// ── Moderation history ───────────────────────────────────────────────────────
export type ModerationActionKind =
  | "warning"
  | "content_removed"
  | "suspended"
  | "unsuspended"
  | "removed"

export const MODERATION_ACTION_META: Record<ModerationActionKind, { label: string; text: string }> = {
  warning: { label: "Warning", text: "text-amber-300" },
  content_removed: { label: "Content removed", text: "text-orange-300" },
  suspended: { label: "Suspended", text: "text-red-300" },
  unsuspended: { label: "Suspension lifted", text: "text-emerald-300" },
  removed: { label: "Removed from Home", text: "text-red-400" },
}

export function moderationActionLabel(kind: string): string {
  return MODERATION_ACTION_META[kind as ModerationActionKind]?.label ?? kind
}

// ── View shapes ──────────────────────────────────────────────────────────────
export type HomeReportView = {
  id: string
  targetType: ReportTargetType
  targetId: string | null
  targetPreview: string | null
  reason: ReportReason
  reasonLabel: string
  details: string | null
  status: ReportStatus
  resolution: ReportResolution | null
  resolutionLabel: string | null
  createdAt: string // ISO
  updatedAt: string // ISO
  resolvedAt: string | null
  resolvedByName: string | null
  // Reporter is visible to admins ONLY (never sent to the reported member).
  reporter: { id: string; name: string; initials: string; color: string }
  // The member the report concerns.
  reported: {
    userId: string
    name: string
    image: string | null
    initials: string
    color: string
  }
}

export type HomeReportQueueCounts = {
  pending: number
  under_review: number
  resolved: number
  total: number
}

export type HomeModerationActionView = {
  id: string
  action: ModerationActionKind
  actionLabel: string
  reason: string | null
  suspendedUntil: string | null // ISO
  adminName: string
  at: string // ISO
}

// Current Home-scoped discipline state for one member.
export type MemberModerationState = {
  suspended: boolean
  suspendedUntil: string | null // ISO; null + suspended = indefinite
  suspendedReason: string | null
  suspendedByName: string | null
  warnings: number
  history: HomeModerationActionView[]
}

/**
 * Whether a membership's suspension overlay is currently active.
 * Active when suspendedAt is set AND (no expiry, or expiry in the future).
 */
export function isSuspensionActive(
  suspendedAt: Date | string | null | undefined,
  suspendedUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!suspendedAt) return false
  if (!suspendedUntil) return true // indefinite
  return new Date(suspendedUntil).getTime() > now.getTime()
}

export const REPORT_CONFIRMATION = "Report submitted"
