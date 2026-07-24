import { and, desc, eq, gt, ilike, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditLog, session, user, adminMember } from "@/lib/db/schema"

const PAGE_SIZE = 25

export type AuditLogRow = {
  id: string
  adminId: string
  adminName: string | null
  action: string
  targetType: string | null
  targetId: string | null
  result: string
  ipAddress: string | null
  metadata: unknown
  createdAt: string
}

/** Audit trail, newest first, with the acting admin's display name resolved. */
export async function listAuditLogs(
  filter: { q?: string; result?: "success" | "failure" | "all" } = {},
  page = 0,
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const conds = []
  if (filter.q?.trim()) {
    const q = `%${filter.q.trim()}%`
    conds.push(or(ilike(auditLog.action, q), ilike(auditLog.targetType, q), ilike(auditLog.targetId, q)))
  }
  if (filter.result && filter.result !== "all") {
    conds.push(eq(auditLog.result, filter.result))
  }
  const where = conds.length ? and(...conds) : undefined

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        adminId: auditLog.adminId,
        adminName: user.name,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        result: auditLog.result,
        ipAddress: auditLog.ipAddress,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.adminId))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)` }).from(auditLog).where(where),
  ])

  return {
    rows: rows.map((r) => ({
      ...r,
      createdAt: (r.createdAt as Date).toISOString(),
    })),
    total: Number(totalRow[0]?.n ?? 0),
  }
}

export type LoginRow = {
  id: string
  userId: string
  userName: string | null
  userEmail: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
  active: boolean
}

/** Login history derived from the session table, newest first. */
export async function listLoginHistory(page = 0): Promise<{ rows: LoginRow[]; total: number }> {
  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: session.id,
        userId: session.userId,
        userName: user.name,
        userEmail: user.email,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .leftJoin(user, eq(user.id, session.userId))
      .orderBy(desc(session.createdAt))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)` }).from(session),
  ])

  const now = Date.now()
  return {
    rows: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: (r.createdAt as Date).toISOString(),
      expiresAt: (r.expiresAt as Date).toISOString(),
      active: (r.expiresAt as Date).getTime() > now,
    })),
    total: Number(totalRow[0]?.n ?? 0),
  }
}

export type ActiveSessionRow = LoginRow & { isAdmin: boolean }

/** Currently-active (non-expired) sessions, admins first. */
export async function listActiveSessions(): Promise<ActiveSessionRow[]> {
  const rows = await db
    .select({
      id: session.id,
      userId: session.userId,
      userName: user.name,
      userEmail: user.email,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      adminId: adminMember.userId,
    })
    .from(session)
    .leftJoin(user, eq(user.id, session.userId))
    .leftJoin(adminMember, eq(adminMember.userId, session.userId))
    .where(gt(session.expiresAt, sql`now()`))
    .orderBy(desc(session.updatedAt))
    .limit(200)

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    createdAt: (r.createdAt as Date).toISOString(),
    expiresAt: (r.expiresAt as Date).toISOString(),
    active: true,
    isAdmin: r.adminId != null,
  }))
}

export type SecurityStats = {
  totalAudit: number
  failures24h: number
  activeSessions: number
  activeAdmins: number
}

export async function getSecurityStats(): Promise<SecurityStats> {
  const [audit, fails, active, admins] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(auditLog),
    db
      .select({ n: sql<number>`count(*)` })
      .from(auditLog)
      .where(and(eq(auditLog.result, "failure"), gt(auditLog.createdAt, sql`now() - interval '24 hours'`))),
    db.select({ n: sql<number>`count(*)` }).from(session).where(gt(session.expiresAt, sql`now()`)),
    db
      .select({ n: sql<number>`count(distinct ${session.userId})` })
      .from(session)
      .innerJoin(adminMember, eq(adminMember.userId, session.userId))
      .where(gt(session.expiresAt, sql`now()`)),
  ])
  return {
    totalAudit: Number(audit[0]?.n ?? 0),
    failures24h: Number(fails[0]?.n ?? 0),
    activeSessions: Number(active[0]?.n ?? 0),
    activeAdmins: Number(admins[0]?.n ?? 0),
  }
}

/** Revokes a single session by deleting it. Returns true if a row was removed. */
export async function revokeSessionById(sessionId: string): Promise<boolean> {
  const res = await db.delete(session).where(eq(session.id, sessionId)).returning({ id: session.id })
  return res.length > 0
}
