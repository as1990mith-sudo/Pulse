"use server"

// Server data layer for the Home Members command centre.
//
// Every export re-checks the caller's Home permission server-side (never trust
// the client), scopes strictly to the resolved Home, and derives engagement
// from real activity (feed posts, comments, post-likes) inside that Home over
// the selected timeframe. Search / sort / filter / pagination all resolve here
// so the browser never receives the whole roster.

import { and, eq, gte, sql, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { user as userTable, homeMembership, feedPost, feedComment, like } from "@/lib/db/schema"
import { getHomeByHandle, getViewerId, getViewerMembership } from "@/lib/home/access"
import { homeRoleHasPermission, homeRoleLabel, type HomeRole } from "@/lib/home/roles"
import { getAvatarColor, getInitials } from "@/lib/identity"
import {
  scoreEngagement,
  levelForScore,
  normalizeGender,
  timeframeDays,
  ACTIVITY_META,
  GENDER_LABEL,
  type MemberDirectoryQuery,
  type MemberDirectoryResult,
  type MemberDirectoryRow,
  type MemberDetail,
  type MemberActivityItem,
  type MemberExportRow,
  type MemberSnapshot,
  type EngagementLeader,
  type MemberFilters,
  type MemberSort,
  type LeaderboardRanking,
} from "@/lib/home/members"

type Perm = Parameters<typeof homeRoleHasPermission>[1]

async function requireManager(handle: string, permission: Perm) {
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, permission)) {
    throw new Error("You don't have permission to do that.")
  }
  const viewerId = await getViewerId()
  return { home, membership, viewerId }
}

// ── Aggregation helpers ──────────────────────────────────────────────────────

type CountRow = { u: string; c: number }

async function timeframeCounts(homeId: string, since: Date, userId?: string) {
  const postWhere = userId
    ? and(eq(feedPost.homeId, homeId), gte(feedPost.createdAt, since), eq(feedPost.userId, userId))
    : and(eq(feedPost.homeId, homeId), gte(feedPost.createdAt, since))
  const commentWhere = userId
    ? and(eq(feedPost.homeId, homeId), gte(feedComment.createdAt, since), eq(feedComment.userId, userId))
    : and(eq(feedPost.homeId, homeId), gte(feedComment.createdAt, since))
  const likeWhere = userId
    ? and(eq(feedPost.homeId, homeId), gte(like.createdAt, since), eq(like.userId, userId))
    : and(eq(feedPost.homeId, homeId), gte(like.createdAt, since))

  const [posts, comments, likes] = await Promise.all([
    db.select({ u: feedPost.userId, c: count() }).from(feedPost).where(postWhere).groupBy(feedPost.userId),
    db
      .select({ u: feedComment.userId, c: count() })
      .from(feedComment)
      .innerJoin(feedPost, eq(feedComment.postId, feedPost.id))
      .where(commentWhere)
      .groupBy(feedComment.userId),
    db
      .select({ u: like.userId, c: count() })
      .from(like)
      .innerJoin(feedPost, and(eq(like.targetType, "post"), eq(like.targetId, feedPost.id)))
      .where(likeWhere)
      .groupBy(like.userId),
  ])
  return {
    posts: posts as CountRow[],
    comments: comments as CountRow[],
    likes: likes as CountRow[],
  }
}

async function lastActivityMap(homeId: string, userId?: string): Promise<Map<string, number>> {
  const postWhere = userId ? and(eq(feedPost.homeId, homeId), eq(feedPost.userId, userId)) : eq(feedPost.homeId, homeId)
  const commentWhere = userId
    ? and(eq(feedPost.homeId, homeId), eq(feedComment.userId, userId))
    : eq(feedPost.homeId, homeId)
  const likeWhere = userId ? and(eq(feedPost.homeId, homeId), eq(like.userId, userId)) : eq(feedPost.homeId, homeId)

  const [posts, comments, likes] = await Promise.all([
    db
      .select({ u: feedPost.userId, t: sql<string>`max(${feedPost.createdAt})` })
      .from(feedPost)
      .where(postWhere)
      .groupBy(feedPost.userId),
    db
      .select({ u: feedComment.userId, t: sql<string>`max(${feedComment.createdAt})` })
      .from(feedComment)
      .innerJoin(feedPost, eq(feedComment.postId, feedPost.id))
      .where(commentWhere)
      .groupBy(feedComment.userId),
    db
      .select({ u: like.userId, t: sql<string>`max(${like.createdAt})` })
      .from(like)
      .innerJoin(feedPost, and(eq(like.targetType, "post"), eq(like.targetId, feedPost.id)))
      .where(likeWhere)
      .groupBy(like.userId),
  ])

  const map = new Map<string, number>()
  for (const rows of [posts, comments, likes]) {
    for (const r of rows as { u: string; t: string | null }[]) {
      if (!r.t) continue
      const ms = new Date(r.t).getTime()
      const prev = map.get(r.u)
      if (prev === undefined || ms > prev) map.set(r.u, ms)
    }
  }
  return map
}

function toMap(rows: CountRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.u, Number(r.c) || 0)
  return m
}

// Build the fully-resolved roster (every member with derived engagement). Shared
// by the directory, the snapshot, the leaderboard and the export so all four can
// never drift.
async function buildRoster(homeId: string, viewerId: string | null, since: Date): Promise<MemberDirectoryRow[]> {
  const [rosterRows, counts, lastMap] = await Promise.all([
    db
      .select({ m: homeMembership, u: userTable })
      .from(homeMembership)
      .innerJoin(userTable, eq(userTable.id, homeMembership.userId))
      .where(eq(homeMembership.homeId, homeId)),
    timeframeCounts(homeId, since),
    lastActivityMap(homeId),
  ])

  const postMap = toMap(counts.posts)
  const commentMap = toMap(counts.comments)
  const likeMap = toMap(counts.likes)

  return rosterRows.map(({ m, u }) => {
    const posts = postMap.get(u.id) ?? 0
    const comments = commentMap.get(u.id) ?? 0
    const likes = likeMap.get(u.id) ?? 0
    const score = scoreEngagement(posts, comments, likes)
    const lastMs = lastMap.get(u.id)
    return {
      id: m.id,
      userId: m.userId,
      name: u.name,
      email: u.email,
      phone: u.phone ?? null,
      gender: normalizeGender(u.gender),
      image: u.image,
      initials: getInitials(u.name),
      color: getAvatarColor(u.id),
      role: m.role as HomeRole,
      status: (m.status === "pending" ? "pending" : "active") as "active" | "pending",
      joinedAt: m.createdAt.toISOString(),
      lastActiveAt: lastMs ? new Date(lastMs).toISOString() : null,
      isViewer: m.userId === viewerId,
      engagement: { posts, comments, likes, score, level: levelForScore(score) },
    }
  })
}

function computeSnapshot(rows: MemberDirectoryRow[], since: Date): MemberSnapshot {
  const active = rows.filter((r) => r.status === "active")
  const sinceMs = since.getTime()
  return {
    total: active.length,
    active: active.filter((r) => r.engagement.score > 0).length,
    new: active.filter((r) => new Date(r.joinedAt).getTime() >= sinceMs).length,
    inactive: active.filter((r) => r.engagement.score === 0).length,
    admins: active.filter((r) => r.role === "owner" || r.role === "administrator").length,
  }
}

function computeLeaders(rows: MemberDirectoryRow[], ranking: LeaderboardRanking): EngagementLeader[] {
  const metric = (r: MemberDirectoryRow) =>
    ranking === "posts"
      ? r.engagement.posts
      : ranking === "comments"
        ? r.engagement.comments
        : ranking === "likes"
          ? r.engagement.likes
          : r.engagement.score
  return rows
    .filter((r) => r.status === "active" && metric(r) > 0)
    .sort((a, b) => metric(b) - metric(a) || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((r) => ({
      membershipId: r.id,
      userId: r.userId,
      name: r.name,
      image: r.image,
      initials: r.initials,
      color: r.color,
      posts: r.engagement.posts,
      comments: r.engagement.comments,
      likes: r.engagement.likes,
      score: r.engagement.score,
    }))
}

function joinedCutoff(joined: MemberFilters["joined"]): number | null {
  if (joined === "all") return null
  const now = new Date()
  const d = new Date(now)
  switch (joined) {
    case "today":
      d.setHours(0, 0, 0, 0)
      break
    case "week":
      d.setDate(now.getDate() - 7)
      break
    case "month":
      d.setMonth(now.getMonth() - 1)
      break
    case "3months":
      d.setMonth(now.getMonth() - 3)
      break
    case "6months":
      d.setMonth(now.getMonth() - 6)
      break
  }
  return d.getTime()
}

function applyFilters(rows: MemberDirectoryRow[], q: MemberDirectoryQuery): MemberDirectoryRow[] {
  const term = q.search.trim().toLowerCase()
  const cutoff = joinedCutoff(q.filters.joined)
  return rows.filter((r) => {
    // Status / role
    if (q.filters.status === "pending") {
      if (r.status !== "pending") return false
    } else if (q.filters.status !== "all") {
      if (r.role !== q.filters.status || r.status !== "active") return false
    }
    if (q.filters.gender !== "all" && r.gender !== q.filters.gender) return false
    if (q.filters.activity !== "all" && r.engagement.level !== q.filters.activity) return false
    if (cutoff !== null && new Date(r.joinedAt).getTime() < cutoff) return false
    if (term) {
      const hay = `${r.name} ${r.email} ${r.phone ?? ""} ${r.id}`.toLowerCase()
      if (!hay.includes(term)) return false
    }
    return true
  })
}

function applySort(rows: MemberDirectoryRow[], sort: MemberSort): MemberDirectoryRow[] {
  const byName = (a: MemberDirectoryRow, b: MemberDirectoryRow) => a.name.localeCompare(b.name)
  const arr = [...rows]
  switch (sort) {
    case "most_active":
      return arr.sort((a, b) => b.engagement.score - a.engagement.score || byName(a, b))
    case "least_active":
      return arr.sort((a, b) => a.engagement.score - b.engagement.score || byName(a, b))
    case "most_posts":
      return arr.sort((a, b) => b.engagement.posts - a.engagement.posts || byName(a, b))
    case "most_comments":
      return arr.sort((a, b) => b.engagement.comments - a.engagement.comments || byName(a, b))
    case "most_likes":
      return arr.sort((a, b) => b.engagement.likes - a.engagement.likes || byName(a, b))
    case "recent":
      return arr.sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
    case "oldest":
      return arr.sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())
    case "name_az":
      return arr.sort(byName)
    case "name_za":
      return arr.sort((a, b) => byName(b, a))
    default:
      return arr
  }
}

// ── Public reads ─────────────────────────────────────────────────────────────

export async function getMembersDirectory(
  handle: string,
  query: MemberDirectoryQuery,
): Promise<MemberDirectoryResult> {
  const { home, viewerId } = await requireManager(handle, "members.view")
  const since = new Date(Date.now() - timeframeDays(query.timeframe) * 86_400_000)

  const roster = await buildRoster(home.id, viewerId, since)
  const snapshot = computeSnapshot(roster, since)
  const leaders = computeLeaders(roster, query.ranking)

  const filtered = applySort(applyFilters(roster, query), query.sort)
  const total = filtered.length
  const pageSize = Math.max(1, query.pageSize)
  const page = Math.max(1, query.page)
  const start = (page - 1) * pageSize
  const rows = filtered.slice(start, start + pageSize)

  return { rows, total, snapshot, leaders, timeframe: query.timeframe, page, pageSize }
}

function snippet(text: string | null | undefined, n = 48): string | null {
  if (!text) return null
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return null
  return clean.length > n ? clean.slice(0, n).trimEnd() + "…" : clean
}

export async function getMemberDetail(
  handle: string,
  membershipId: string,
  timeframe: MemberDirectoryQuery["timeframe"],
): Promise<MemberDetail | null> {
  const { home, viewerId } = await requireManager(handle, "members.view")
  const since = new Date(Date.now() - timeframeDays(timeframe) * 86_400_000)

  const found = await db
    .select({ m: homeMembership, u: userTable })
    .from(homeMembership)
    .innerJoin(userTable, eq(userTable.id, homeMembership.userId))
    .where(and(eq(homeMembership.id, membershipId), eq(homeMembership.homeId, home.id)))
    .limit(1)
  if (found.length === 0) return null
  const { m, u } = found[0]

  const [counts, lastMap, recentPosts, recentComments, recentLikes] = await Promise.all([
    timeframeCounts(home.id, since, m.userId),
    lastActivityMap(home.id, m.userId),
    db
      .select({ id: feedPost.id, text: feedPost.text, at: feedPost.createdAt })
      .from(feedPost)
      .where(and(eq(feedPost.homeId, home.id), eq(feedPost.userId, m.userId)))
      .orderBy(sql`${feedPost.createdAt} desc`)
      .limit(10),
    db
      .select({ id: feedComment.id, text: feedComment.text, at: feedComment.createdAt, postText: feedPost.text })
      .from(feedComment)
      .innerJoin(feedPost, eq(feedComment.postId, feedPost.id))
      .where(and(eq(feedPost.homeId, home.id), eq(feedComment.userId, m.userId)))
      .orderBy(sql`${feedComment.createdAt} desc`)
      .limit(10),
    db
      .select({ id: like.id, at: like.createdAt, postText: feedPost.text })
      .from(like)
      .innerJoin(feedPost, and(eq(like.targetType, "post"), eq(like.targetId, feedPost.id)))
      .where(and(eq(feedPost.homeId, home.id), eq(like.userId, m.userId)))
      .orderBy(sql`${like.createdAt} desc`)
      .limit(10),
  ])

  const posts = Number(counts.posts[0]?.c ?? 0)
  const comments = Number(counts.comments[0]?.c ?? 0)
  const likes = Number(counts.likes[0]?.c ?? 0)
  const score = scoreEngagement(posts, comments, likes)
  const lastMs = lastMap.get(m.userId)

  const row: MemberDirectoryRow = {
    id: m.id,
    userId: m.userId,
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    gender: normalizeGender(u.gender),
    image: u.image,
    initials: getInitials(u.name),
    color: getAvatarColor(u.id),
    role: m.role as HomeRole,
    status: (m.status === "pending" ? "pending" : "active") as "active" | "pending",
    joinedAt: m.createdAt.toISOString(),
    lastActiveAt: lastMs ? new Date(lastMs).toISOString() : null,
    isViewer: m.userId === viewerId,
    engagement: { posts, comments, likes, score, level: levelForScore(score) },
  }

  const recent: MemberActivityItem[] = [
    ...recentPosts.map((p) => ({
      id: `post-${p.id}`,
      kind: "post" as const,
      label: "Published a post",
      ref: snippet(p.text),
      at: p.at.toISOString(),
    })),
    ...recentComments.map((c) => ({
      id: `comment-${c.id}`,
      kind: "comment" as const,
      label: "Commented on a post",
      ref: snippet(c.postText) ?? snippet(c.text),
      at: c.at.toISOString(),
    })),
    ...recentLikes.map((l) => ({
      id: `like-${l.id}`,
      kind: "like" as const,
      label: "Liked a post",
      ref: snippet(l.postText),
      at: l.at.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 15)

  return { row, recent }
}

// ── Admins roster ────────────────────────────────────────────────────────────
// The "Admins" destination (reached from the ADMINS stat card) shows only the
// people who help run the Home — every active member whose role is not the plain
// `member` role — with their assigned role. It is read-only and intentionally
// separate from the full Members command centre.

export type HomeAdminRosterRow = {
  id: string
  userId: string
  name: string
  email: string
  image: string | null
  initials: string
  color: string
  role: HomeRole
  roleLabel: string
  joinedAt: string
  isViewer: boolean
}

// Presentation order for admin roles — highest authority first.
const ADMIN_ROLE_ORDER: HomeRole[] = ["owner", "administrator", "leader", "content_manager", "moderator"]

export async function getHomeAdmins(handle: string): Promise<HomeAdminRosterRow[]> {
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active") {
    throw new Error("You don't have permission to do that.")
  }
  const viewerId = await getViewerId()

  const rows = await db
    .select({ m: homeMembership, u: userTable })
    .from(homeMembership)
    .innerJoin(userTable, eq(userTable.id, homeMembership.userId))
    .where(and(eq(homeMembership.homeId, home.id), eq(homeMembership.status, "active")))

  return rows
    .filter(({ m }) => m.role !== "member")
    .map(({ m, u }) => ({
      id: m.id,
      userId: m.userId,
      name: u.name,
      email: u.email,
      image: u.image,
      initials: getInitials(u.name),
      color: getAvatarColor(u.id),
      role: m.role as HomeRole,
      roleLabel: homeRoleLabel(m.role as HomeRole),
      joinedAt: m.createdAt.toISOString(),
      isViewer: m.userId === viewerId,
    }))
    .sort((a, b) => {
      const ra = ADMIN_ROLE_ORDER.indexOf(a.role)
      const rb = ADMIN_ROLE_ORDER.indexOf(b.role)
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
}

export async function getMembersForExport(handle: string, query: MemberDirectoryQuery): Promise<MemberExportRow[]> {
  const { home, viewerId } = await requireManager(handle, "members.view")
  const since = new Date(Date.now() - timeframeDays(query.timeframe) * 86_400_000)
  const roster = await buildRoster(home.id, viewerId, since)
  const rows = applySort(applyFilters(roster, query), query.sort)

  return rows.map((r) => {
    const parts = r.name.trim().split(/\s+/)
    const first = parts[0] ?? ""
    const last = parts.length > 1 ? parts.slice(1).join(" ") : ""
    const statusLabel = r.status === "pending" ? "Pending" : homeRoleLabel(r.role)
    return {
      "First Name": first,
      "Last Name": last,
      "Full Name": r.name,
      Email: r.email,
      Phone: r.phone ?? "",
      Gender: r.gender ? GENDER_LABEL[r.gender] : "",
      Status: statusLabel,
      "Date Joined": r.joinedAt.slice(0, 10),
      "Activity Level": ACTIVITY_META[r.engagement.level].label,
      Posts: r.engagement.posts,
      Comments: r.engagement.comments,
      Likes: r.engagement.likes,
      "Engagement Score": r.engagement.score,
      "Last Active": r.lastActiveAt ? r.lastActiveAt.slice(0, 10) : "",
    }
  })
}
