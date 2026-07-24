import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  adminMember,
  episode,
  feedPost,
  follow,
  moderationAction,
  session,
  user as userTable,
  userModerationState,
} from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import type { AdminRole } from "@/lib/rbac"

export type UserModStatus = "active" | "warned" | "suspended" | "banned"

export type AdminUserRow = {
  id: string
  name: string
  email: string
  image: string | null
  initials: string
  color: string
  createdAt: string
  status: UserModStatus
  verified: boolean
  warnings: number
  role: AdminRole | null
  online: boolean
}

const PAGE_SIZE = 20

/** Searches users by name/email (or lists all), newest first, with their
 * moderation state, admin role, and live-session presence attached. */
export async function searchUsers(query: string, page = 0): Promise<{ rows: AdminUserRow[]; total: number }> {
  const q = query.trim()
  const where = q ? or(ilike(userTable.name, `%${q}%`), ilike(userTable.email, `%${q}%`)) : undefined
  const now = new Date()

  const base = db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      createdAt: userTable.createdAt,
      status: userModerationState.status,
      verified: userModerationState.verified,
      warnings: userModerationState.warnings,
      role: adminMember.role,
      online: sql<boolean>`exists (select 1 from ${session} s where s."userId" = ${userTable.id} and s."expiresAt" > ${now})`,
    })
    .from(userTable)
    .leftJoin(userModerationState, eq(userModerationState.userId, userTable.id))
    .leftJoin(adminMember, eq(adminMember.userId, userTable.id))

  const [rows, [totalRow]] = await Promise.all([
    (where ? base.where(where) : base)
      .orderBy(desc(userTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    where
      ? db.select({ n: count() }).from(userTable).where(where)
      : db.select({ n: count() }).from(userTable),
  ])

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      image: r.image,
      initials: getInitials(r.name),
      color: getAvatarColor(r.id),
      createdAt: r.createdAt.toISOString(),
      status: (r.status as UserModStatus) ?? "active",
      verified: r.verified ?? false,
      warnings: r.warnings ?? 0,
      role: (r.role as AdminRole) ?? null,
      online: Boolean(r.online),
    })),
    total: Number(totalRow?.n ?? 0),
  }
}

export type AdminUserProfile = {
  user: AdminUserRow & { bio: string | null; suspendedUntil: string | null; reason: string | null }
  stats: { posts: number; followers: number; following: number; episodes: number }
  moderationHistory: {
    id: string
    action: string
    reason: string | null
    adminId: string
    createdAt: string
  }[]
  loginHistory: {
    id: string
    ipAddress: string | null
    userAgent: string | null
    createdAt: string
    expiresAt: string
    current: boolean
  }[]
}

async function countRows(table: any, where: any) {
  const [row] = await db.select({ n: count() }).from(table).where(where)
  return Number(row?.n ?? 0)
}

/** Full profile overview for one user: identity, moderation state, activity
 * stats, and both moderation + login history. Returns null if not found. */
export async function getUserProfile(userId: string): Promise<AdminUserProfile | null> {
  const [u] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
  if (!u) return null

  const now = new Date()
  const [modState] = await db
    .select()
    .from(userModerationState)
    .where(eq(userModerationState.userId, userId))
    .limit(1)
  const [adminRow] = await db.select().from(adminMember).where(eq(adminMember.userId, userId)).limit(1)

  const [posts, followers, following, episodes, modHistory, sessions] = await Promise.all([
    countRows(feedPost, eq(feedPost.userId, userId)),
    countRows(follow, eq(follow.followingId, userId)),
    countRows(follow, eq(follow.followerId, userId)),
    countRows(episode, eq(episode.hostUserId, userId)),
    db
      .select()
      .from(moderationAction)
      .where(and(eq(moderationAction.targetType, "user"), eq(moderationAction.targetId, userId)))
      .orderBy(desc(moderationAction.createdAt))
      .limit(50),
    db.select().from(session).where(eq(session.userId, userId)).orderBy(desc(session.createdAt)).limit(20),
  ])

  const online = sessions.some((s) => s.expiresAt > now)

  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      initials: getInitials(u.name),
      color: getAvatarColor(u.id),
      createdAt: u.createdAt.toISOString(),
      status: (modState?.status as UserModStatus) ?? "active",
      verified: modState?.verified ?? false,
      warnings: modState?.warnings ?? 0,
      role: (adminRow?.role as AdminRole) ?? null,
      online,
      bio: u.bio,
      suspendedUntil: modState?.suspendedUntil ? modState.suspendedUntil.toISOString() : null,
      reason: modState?.reason ?? null,
    },
    stats: { posts, followers, following, episodes },
    moderationHistory: modHistory.map((m) => ({
      id: m.id,
      action: m.action,
      reason: m.reason,
      adminId: m.adminId,
      createdAt: m.createdAt.toISOString(),
    })),
    loginHistory: sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.expiresAt > now,
    })),
  }
}

/** Count of users currently online (unexpired session). */
export async function getOnlineUserIds(): Promise<Set<string>> {
  const now = new Date()
  const rows = await db
    .selectDistinct({ userId: session.userId })
    .from(session)
    .where(sql`${session.expiresAt} > ${now}`)
  return new Set(rows.map((r) => r.userId))
}
