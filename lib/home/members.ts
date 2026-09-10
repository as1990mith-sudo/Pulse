// Client-safe service layer for the Home Members command centre.
//
// This module holds the *domain model* for member engagement — types, the
// deterministic weighted scoring rules, the activity-level thresholds, and the
// option lists that drive the directory's search / sort / filter controls. It
// deliberately imports nothing server-only, so both the server actions
// (app/actions/home-members.ts) and the client UI can share one source of truth.
//
// Engagement is DERIVED from real Home activity (posts, comments, likes). The
// weights and thresholds live here — never hard-coded into the UI — so a Home
// could tune "what counts as engaged" without touching a component.

import type { HomeRole } from "@/lib/home/roles"

// ── Timeframe ────────────────────────────────────────────────────────────────
export type MemberTimeframe = "7d" | "30d" | "90d"

export const MEMBER_TIMEFRAMES: { id: MemberTimeframe; label: string; short: string; days: number }[] = [
  { id: "7d", label: "7 days", short: "7d", days: 7 },
  { id: "30d", label: "30 days", short: "30d", days: 30 },
  { id: "90d", label: "90 days", short: "90d", days: 90 },
]

export const DEFAULT_TIMEFRAME: MemberTimeframe = "30d"

export function timeframeDays(t: MemberTimeframe): number {
  return MEMBER_TIMEFRAMES.find((x) => x.id === t)?.days ?? 30
}

// ── Engagement scoring (configurable, not hard-coded in the UI) ──────────────
// A post is a substantial contribution, a comment a meaningful one, a like the
// lightest signal — so they are weighted, never summed flat.
export const ENGAGEMENT_WEIGHTS = { post: 10, comment: 4, like: 1 } as const

// Activity level is measured against the WEIGHTED score within the selected
// timeframe. Because it reads real contributions (not tenure), a brand-new
// member with nothing published never reads as "highly active".
export const ACTIVITY_THRESHOLDS = { high: 60, active: 15, low: 1 } as const

export type ActivityLevel = "high" | "active" | "low" | "inactive"

export function scoreEngagement(posts: number, comments: number, likes: number): number {
  return (
    posts * ENGAGEMENT_WEIGHTS.post +
    comments * ENGAGEMENT_WEIGHTS.comment +
    likes * ENGAGEMENT_WEIGHTS.like
  )
}

export function levelForScore(score: number): ActivityLevel {
  if (score >= ACTIVITY_THRESHOLDS.high) return "high"
  if (score >= ACTIVITY_THRESHOLDS.active) return "active"
  if (score >= ACTIVITY_THRESHOLDS.low) return "low"
  return "inactive"
}

// Presentation for each level. Colour is a *reinforcement*, never the sole
// signal — every level ships an accessible text label.
export const ACTIVITY_META: Record<ActivityLevel, { label: string; dot: string; text: string }> = {
  high: { label: "Highly active", dot: "bg-emerald-400", text: "text-emerald-300" },
  active: { label: "Active", dot: "bg-sky-400", text: "text-sky-300" },
  low: { label: "Low activity", dot: "bg-amber-400", text: "text-amber-300" },
  inactive: { label: "Inactive", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
}

// ── Gender (administrative data) ─────────────────────────────────────────────
export type Gender = "male" | "female" | "other"

export const GENDER_LABEL: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
}

export function normalizeGender(raw: string | null | undefined): Gender | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (v === "male" || v === "female" || v === "other") return v
  return null
}

// ── Row + aggregate shapes ───────────────────────────────────────────────────
export type MemberEngagement = {
  posts: number
  comments: number
  likes: number
  score: number
  level: ActivityLevel
}

export type MemberDirectoryRow = {
  id: string // membership id
  userId: string
  name: string
  email: string
  phone: string | null
  gender: Gender | null
  image: string | null
  initials: string
  color: string // avatar tailwind class ("bg-… text-…")
  role: HomeRole
  status: "active" | "pending"
  joinedAt: string // ISO
  lastActiveAt: string | null // ISO — most recent meaningful Home activity
  isViewer: boolean
  engagement: MemberEngagement
}

export type MemberSnapshot = {
  total: number
  active: number
  new: number
  inactive: number
  admins: number
}

export type EngagementLeader = {
  membershipId: string
  userId: string
  name: string
  image: string | null
  initials: string
  color: string
  posts: number
  comments: number
  likes: number
  score: number
}

// ── Query contract (search / sort / filter / paginate) ───────────────────────
export type LeaderboardRanking = "overall" | "posts" | "comments" | "likes"

export const LEADERBOARD_RANKINGS: { id: LeaderboardRanking; label: string }[] = [
  { id: "overall", label: "Overall" },
  { id: "posts", label: "Posts" },
  { id: "comments", label: "Comments" },
  { id: "likes", label: "Likes" },
]

export type MemberSort =
  | "most_active"
  | "least_active"
  | "most_posts"
  | "most_comments"
  | "most_likes"
  | "recent"
  | "oldest"
  | "name_az"
  | "name_za"

export const SORT_OPTIONS: { id: MemberSort; label: string }[] = [
  { id: "most_active", label: "Most active" },
  { id: "least_active", label: "Least active" },
  { id: "most_posts", label: "Most posts" },
  { id: "most_comments", label: "Most comments" },
  { id: "most_likes", label: "Most likes" },
  { id: "recent", label: "Recently joined" },
  { id: "oldest", label: "Oldest members" },
  { id: "name_az", label: "Name A–Z" },
  { id: "name_za", label: "Name Z–A" },
]

export const DEFAULT_SORT: MemberSort = "most_active"

// Status filter maps to the real backend states: each Home role, plus the
// pending membership state. No "suspended" — the schema has no such state.
export type StatusFilter = "all" | HomeRole | "pending"

export const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "owner", label: "Owner" },
  { id: "administrator", label: "Administrator" },
  { id: "content_manager", label: "Content Manager" },
  { id: "moderator", label: "Moderator" },
  { id: "leader", label: "Pastor / Leader" },
  { id: "member", label: "Member" },
  { id: "pending", label: "Pending" },
]

export type GenderFilter = "all" | Gender
export const GENDER_OPTIONS: { id: GenderFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "other", label: "Other" },
]

export type ActivityFilter = "all" | ActivityLevel
export const ACTIVITY_OPTIONS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "Highly active" },
  { id: "active", label: "Active" },
  { id: "low", label: "Low activity" },
  { id: "inactive", label: "Inactive" },
]

export type JoinedFilter = "all" | "today" | "week" | "month" | "3months" | "6months"
export const JOINED_OPTIONS: { id: JoinedFilter; label: string }[] = [
  { id: "all", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "3months", label: "Last 3 months" },
  { id: "6months", label: "Last 6 months" },
]

export type MemberFilters = {
  status: StatusFilter
  gender: GenderFilter
  activity: ActivityFilter
  joined: JoinedFilter
}

export const DEFAULT_FILTERS: MemberFilters = {
  status: "all",
  gender: "all",
  activity: "all",
  joined: "all",
}

export const DEFAULT_PAGE_SIZE = 25

export type MemberDirectoryQuery = {
  timeframe: MemberTimeframe
  ranking: LeaderboardRanking
  sort: MemberSort
  search: string
  filters: MemberFilters
  page: number
  pageSize: number
}

export function defaultQuery(): MemberDirectoryQuery {
  return {
    timeframe: DEFAULT_TIMEFRAME,
    ranking: "overall",
    sort: DEFAULT_SORT,
    search: "",
    filters: { ...DEFAULT_FILTERS },
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  }
}

export type MemberDirectoryResult = {
  rows: MemberDirectoryRow[]
  total: number
  snapshot: MemberSnapshot
  leaders: EngagementLeader[]
  timeframe: MemberTimeframe
  page: number
  pageSize: number
}

// ── Member detail (drawer) ───────────────────────────────────────────────────
export type MemberActivityItem = {
  id: string
  kind: "post" | "comment" | "like"
  label: string
  ref: string | null
  at: string // ISO
}

export type MemberDetail = {
  row: MemberDirectoryRow
  recent: MemberActivityItem[]
}

// ── Export ───────────────────────────────────────────────────────────────────
export type MemberExportRow = {
  "First Name": string
  "Last Name": string
  "Full Name": string
  Email: string
  Phone: string
  Gender: string
  Status: string
  "Date Joined": string
  "Activity Level": string
  Posts: number
  Comments: number
  Likes: number
  "Engagement Score": number
  "Last Active": string
}

export function countActiveFilters(f: MemberFilters): number {
  let n = 0
  if (f.status !== "all") n++
  if (f.gender !== "all") n++
  if (f.activity !== "all") n++
  if (f.joined !== "all") n++
  return n
}
