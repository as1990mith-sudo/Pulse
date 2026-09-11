"use server"

// Server data layer for the Home-LEVEL moderation system (Reports + member
// discipline). Governance boundary: every read/write here is scoped to a single
// Home and NEVER touches the platform `content_report` / `moderation_action`
// tables (Frequency Super Admin). Member reports stay inside the Home.
//
// Privacy rule: the reporter's identity is stored and visible to admins for
// moderation, but is NEVER returned to the reported member. Member-facing
// submission returns only a confirmation string.
//
// Every admin export re-checks `reports.manage` server-side and resolves the
// Home from the handle, so a client can never forge the Home id or escalate.

import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  feedComment,
  feedPost,
  homeMembership,
  homeModerationAction,
  homeReport,
  user as userTable,
} from "@/lib/db/schema"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { getCurrentUser } from "@/lib/session"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import { getAvatarColor, getInitials } from "@/lib/identity"
import {
  REPORT_CONFIRMATION,
  isSuspensionActive,
  reportReasonLabel,
  reportResolutionLabel,
  suspensionExpiry,
  type HomeModerationActionView,
  type HomeReportQueueCounts,
  type HomeReportView,
  type MemberModerationState,
  type ModerationActionKind,
  type ReportReason,
  type ReportResolution,
  type ReportStatus,
  type ReportTargetType,
  type SuspensionDurationId,
} from "@/lib/home/moderation"

// ── Gate ──────────────────────────────────────────────────────────────────────
async function requireReportManager(handle: string) {
  const current = await getCurrentUser()
  if (!current) throw new Error("You must be signed in.")
  const home = await getHomeByHandle(handle)
  if (!home) throw new Error("Home not found.")
  const membership = await getViewerMembership(home.id)
  if (
    membership?.status !== "active" ||
    !homeRoleHasPermission(membership.role as HomeRole, "reports.manage")
  ) {
    throw new Error("You do not have permission to manage reports in this Home.")
  }
  return { home, userId: current.id, actorName: current.name }
}

// ── Member-facing: submit a report ────────────────────────────────────────────
export type SubmitHomeReportInput = {
  // Required only for MEMBER reports. For post/comment reports the Home is
  // derived from the content itself, so the caller doesn't need to know it.
  handle?: string | null
  targetType: ReportTargetType
  targetId?: string | null // post/comment id (as string) — omit for member reports
  reportedUserId?: string | null // required for member reports; derived otherwise
  reason: ReportReason
  details?: string | null
}

/**
 * A normal member reports a member/post/comment. The report is filed into the
 * owning Home's queue only — it never reaches Frequency Super Admin. Returns a
 * simple confirmation; no case id or workflow is exposed to the member.
 *
 * The Home is resolved from the reported CONTENT for post/comment reports (so a
 * cross-Home main feed still routes each report to the right Home), and from
 * `handle` for member reports.
 */
export async function submitHomeReport(input: SubmitHomeReportInput): Promise<{ ok: true; message: string }> {
  const current = await getCurrentUser()
  if (!current) throw new Error("You must be signed in to report.")

  // Resolve who/what is being reported + a small preview, and the owning Home.
  let homeId: string | null = null
  let reportedUserId = input.reportedUserId ?? null
  let targetPreview: string | null = null

  if (input.targetType === "post") {
    const pid = Number(input.targetId)
    if (!Number.isInteger(pid)) throw new Error("That post no longer exists.")
    const [post] = await db
      .select({ userId: feedPost.userId, text: feedPost.text, homeId: feedPost.homeId })
      .from(feedPost)
      .where(eq(feedPost.id, pid))
    if (!post || !post.homeId) throw new Error("This post can't be reported here.")
    homeId = post.homeId
    reportedUserId = post.userId
    targetPreview = post.text?.slice(0, 240) ?? null
  } else if (input.targetType === "comment") {
    const cid = Number(input.targetId)
    if (!Number.isInteger(cid)) throw new Error("That comment no longer exists.")
    const [row] = await db
      .select({
        userId: feedComment.userId,
        text: feedComment.text,
        homeId: feedPost.homeId,
      })
      .from(feedComment)
      .innerJoin(feedPost, eq(feedComment.postId, feedPost.id))
      .where(eq(feedComment.id, cid))
    if (!row || !row.homeId) throw new Error("This comment can't be reported here.")
    homeId = row.homeId
    reportedUserId = row.userId
    targetPreview = row.text?.slice(0, 240) ?? null
  } else {
    // Member report: the Home must be supplied explicitly.
    if (!input.handle) throw new Error("We couldn't tell which Home to report to.")
    const home = await getHomeByHandle(input.handle)
    if (!home) throw new Error("Home not found.")
    homeId = home.id
  }

  if (!homeId) throw new Error("We couldn't tell which Home to report to.")
  if (!reportedUserId) throw new Error("We couldn't tell who you're reporting.")
  if (reportedUserId === current.id) throw new Error("You can't report yourself.")

  // The reporter must be an active member of the owning Home (community-internal
  // moderation — a non-member can't file into a Home's queue).
  const membership = await getViewerMembership(homeId)
  if (membership?.status !== "active") {
    throw new Error("Only members of this Home can report here.")
  }

  const [reported] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, reportedUserId))

  await db.insert(homeReport).values({
    id: crypto.randomUUID(),
    homeId,
    reporterId: current.id,
    reporterName: current.name,
    reportedUserId,
    reportedName: reported?.name ?? "Member",
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetPreview,
    reason: input.reason,
    details: input.details?.trim() ? input.details.trim().slice(0, 1000) : null,
    status: "pending",
  })

  return { ok: true, message: REPORT_CONFIRMATION }
}

// ── Admin: read the queue ──────────────────────────────────────────────────────
function toReportView(row: typeof homeReport.$inferSelect): HomeReportView {
  return {
    id: row.id,
    targetType: row.targetType as ReportTargetType,
    targetId: row.targetId,
    targetPreview: row.targetPreview,
    reason: row.reason as ReportReason,
    reasonLabel: reportReasonLabel(row.reason),
    details: row.details,
    status: row.status as ReportStatus,
    resolution: (row.resolution as ReportResolution | null) ?? null,
    resolutionLabel: row.resolution ? reportResolutionLabel(row.resolution) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedByName: row.resolvedByName,
    reporter: {
      id: row.reporterId,
      name: row.reporterName,
      initials: getInitials(row.reporterName),
      color: getAvatarColor(row.reporterId),
    },
    reported: {
      userId: row.reportedUserId,
      name: row.reportedName,
      image: null,
      initials: getInitials(row.reportedName),
      color: getAvatarColor(row.reportedUserId),
    },
  }
}

export async function getHomeReports(
  handle: string,
  statusFilter: ReportStatus | "all" = "all",
): Promise<{ reports: HomeReportView[]; counts: HomeReportQueueCounts }> {
  const { home } = await requireReportManager(handle)

  const rows = await db
    .select()
    .from(homeReport)
    .where(eq(homeReport.homeId, home.id))
    .orderBy(desc(homeReport.createdAt))

  // Enrich reported-member avatars in one batch (kept out of the row shape).
  const ids = Array.from(new Set(rows.map((r) => r.reportedUserId)))
  const images = ids.length
    ? await db.select({ id: userTable.id, image: userTable.image }).from(userTable).where(inArray(userTable.id, ids))
    : []
  const imageMap = new Map(images.map((i) => [i.id, i.image]))

  const counts: HomeReportQueueCounts = { pending: 0, under_review: 0, resolved: 0, total: rows.length }
  for (const r of rows) {
    if (r.status === "pending") counts.pending++
    else if (r.status === "under_review") counts.under_review++
    else if (r.status === "resolved") counts.resolved++
  }

  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter)
  const reports = filtered.map((r) => {
    const v = toReportView(r)
    v.reported.image = imageMap.get(r.reportedUserId) ?? null
    return v
  })

  return { reports, counts }
}

// ── Admin: change status (Pending ↔ Under Review) ──────────────────────────────
export async function setReportStatus(handle: string, reportId: string, status: ReportStatus): Promise<void> {
  const { home } = await requireReportManager(handle)
  if (status === "resolved") throw new Error("Use resolveReport to resolve with an outcome.")
  await db
    .update(homeReport)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(homeReport.id, reportId), eq(homeReport.homeId, home.id)))
  revalidatePath(`/org/${handle}/admin/reports`)
}

// ── Admin: record a moderation action (history) ────────────────────────────────
async function recordAction(params: {
  homeId: string
  targetUserId: string
  action: ModerationActionKind
  reason?: string | null
  suspendedUntil?: Date | null
  adminId: string
  adminName: string
  reportId?: string | null
}) {
  await db.insert(homeModerationAction).values({
    id: crypto.randomUUID(),
    homeId: params.homeId,
    targetUserId: params.targetUserId,
    action: params.action,
    reason: params.reason ?? null,
    suspendedUntil: params.suspendedUntil ?? null,
    adminId: params.adminId,
    adminName: params.adminName,
    reportId: params.reportId ?? null,
  })
}

// ── Admin discipline: suspend ──────────────────────────────────────────────────
export async function suspendMember(
  handle: string,
  targetUserId: string,
  duration: SuspensionDurationId,
  reason?: string | null,
): Promise<void> {
  const { home, userId, actorName } = await requireReportManager(handle)
  await assertTargetIsOrdinaryMember(home.id, targetUserId)

  const now = new Date()
  const until = suspensionExpiry(duration, now)
  await db
    .update(homeMembership)
    .set({ suspendedAt: now, suspendedUntil: until, suspendedBy: userId, suspendedReason: reason ?? null })
    .where(and(eq(homeMembership.homeId, home.id), eq(homeMembership.userId, targetUserId)))

  await recordAction({
    homeId: home.id,
    targetUserId,
    action: "suspended",
    reason: reason ?? null,
    suspendedUntil: until,
    adminId: userId,
    adminName: actorName,
  })
  revalidatePath(`/org/${handle}/admin/reports`)
  revalidatePath(`/org/${handle}/admin/members`)
}

export async function unsuspendMember(handle: string, targetUserId: string): Promise<void> {
  const { home, userId, actorName } = await requireReportManager(handle)
  await db
    .update(homeMembership)
    .set({ suspendedAt: null, suspendedUntil: null, suspendedBy: null, suspendedReason: null })
    .where(and(eq(homeMembership.homeId, home.id), eq(homeMembership.userId, targetUserId)))
  await recordAction({
    homeId: home.id,
    targetUserId,
    action: "unsuspended",
    adminId: userId,
    adminName: actorName,
  })
  revalidatePath(`/org/${handle}/admin/reports`)
  revalidatePath(`/org/${handle}/admin/members`)
}

export async function warnMember(handle: string, targetUserId: string, reason?: string | null): Promise<void> {
  const { home, userId, actorName } = await requireReportManager(handle)
  await recordAction({
    homeId: home.id,
    targetUserId,
    action: "warning",
    reason: reason ?? null,
    adminId: userId,
    adminName: actorName,
  })
  revalidatePath(`/org/${handle}/admin/reports`)
}

// ── Admin discipline: remove from Home ─────────────────────────────────────────
// Removing a membership ONLY affects this Home. It never deletes the user's
// Frequency account, their other Home memberships, or their content elsewhere.
export async function removeMemberFromHome(handle: string, targetUserId: string): Promise<void> {
  const { home, userId, actorName } = await requireReportManager(handle)
  await assertTargetIsOrdinaryMember(home.id, targetUserId)

  await db
    .delete(homeMembership)
    .where(and(eq(homeMembership.homeId, home.id), eq(homeMembership.userId, targetUserId)))

  await recordAction({
    homeId: home.id,
    targetUserId,
    action: "removed",
    adminId: userId,
    adminName: actorName,
  })
  revalidatePath(`/org/${handle}/admin/reports`)
  revalidatePath(`/org/${handle}/admin/members`)
}

// ── Admin content moderation ───────────────────────────────────────────────────
// Posts carry a soft-delete flag (hidden from every feed read); comments have no
// such flag and are hard-deleted, matching the existing author-delete behaviour.
export async function removeReportedContent(
  handle: string,
  targetType: "post" | "comment",
  targetId: string,
): Promise<void> {
  const { home, userId, actorName } = await requireReportManager(handle)

  if (targetType === "post") {
    const pid = Number(targetId)
    if (!Number.isInteger(pid)) return
    const [post] = await db
      .select({ userId: feedPost.userId, homeId: feedPost.homeId })
      .from(feedPost)
      .where(eq(feedPost.id, pid))
    if (!post || post.homeId !== home.id) throw new Error("That post isn't in this Home.")
    await db.update(feedPost).set({ deleted: true }).where(eq(feedPost.id, pid))
    await recordAction({
      homeId: home.id,
      targetUserId: post.userId,
      action: "content_removed",
      adminId: userId,
      adminName: actorName,
    })
  } else {
    const cid = Number(targetId)
    if (!Number.isInteger(cid)) return
    const [row] = await db
      .select({ userId: feedComment.userId, homeId: feedPost.homeId })
      .from(feedComment)
      .innerJoin(feedPost, eq(feedComment.postId, feedPost.id))
      .where(eq(feedComment.id, cid))
    if (!row || row.homeId !== home.id) throw new Error("That comment isn't in this Home.")
    await db.delete(feedComment).where(eq(feedComment.id, cid))
    await recordAction({
      homeId: home.id,
      targetUserId: row.userId,
      action: "content_removed",
      adminId: userId,
      adminName: actorName,
    })
  }
  revalidatePath("/feed")
  revalidatePath(`/org/${handle}/admin/reports`)
}

// ── Admin: resolve a report with an outcome ────────────────────────────────────
export async function resolveReport(
  handle: string,
  reportId: string,
  resolution: ReportResolution,
  opts?: { reason?: string | null; suspensionDuration?: SuspensionDurationId },
): Promise<void> {
  const { home, userId, actorName } = await requireReportManager(handle)

  const [report] = await db
    .select()
    .from(homeReport)
    .where(and(eq(homeReport.id, reportId), eq(homeReport.homeId, home.id)))
  if (!report) throw new Error("That report no longer exists.")

  // Carry out the chosen outcome. Each branch reuses the discipline actions so
  // the moderation history is written consistently.
  if (resolution === "content_removed" && (report.targetType === "post" || report.targetType === "comment") && report.targetId) {
    await removeReportedContent(handle, report.targetType, report.targetId)
  } else if (resolution === "warning") {
    await warnMember(handle, report.reportedUserId, opts?.reason ?? null)
  } else if (resolution === "member_suspended") {
    await suspendMember(handle, report.reportedUserId, opts?.suspensionDuration ?? "24h", opts?.reason ?? null)
  } else if (resolution === "member_removed") {
    await removeMemberFromHome(handle, report.reportedUserId)
  }

  await db
    .update(homeReport)
    .set({
      status: "resolved",
      resolution,
      resolvedBy: userId,
      resolvedByName: actorName,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(homeReport.id, reportId), eq(homeReport.homeId, home.id)))

  revalidatePath(`/org/${handle}/admin/reports`)
}

// ── Admin: per-member moderation state + history ───────────────────────────────
export async function getMemberModeration(handle: string, targetUserId: string): Promise<MemberModerationState> {
  const { home } = await requireReportManager(handle)

  const [membership] = await db
    .select({
      suspendedAt: homeMembership.suspendedAt,
      suspendedUntil: homeMembership.suspendedUntil,
      suspendedReason: homeMembership.suspendedReason,
      suspendedBy: homeMembership.suspendedBy,
    })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, home.id), eq(homeMembership.userId, targetUserId)))

  const actions = await db
    .select()
    .from(homeModerationAction)
    .where(and(eq(homeModerationAction.homeId, home.id), eq(homeModerationAction.targetUserId, targetUserId)))
    .orderBy(desc(homeModerationAction.createdAt))

  let suspendedByName: string | null = null
  if (membership?.suspendedBy) {
    const [admin] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, membership.suspendedBy))
    suspendedByName = admin?.name ?? null
  }

  const history: HomeModerationActionView[] = actions.map((a) => ({
    id: a.id,
    action: a.action as ModerationActionKind,
    actionLabel: a.action,
    reason: a.reason,
    suspendedUntil: a.suspendedUntil ? a.suspendedUntil.toISOString() : null,
    adminName: a.adminName,
    at: a.createdAt.toISOString(),
  }))

  const suspended = isSuspensionActive(membership?.suspendedAt ?? null, membership?.suspendedUntil ?? null)

  return {
    suspended,
    suspendedUntil: suspended && membership?.suspendedUntil ? membership.suspendedUntil.toISOString() : null,
    suspendedReason: suspended ? membership?.suspendedReason ?? null : null,
    suspendedByName: suspended ? suspendedByName : null,
    warnings: actions.filter((a) => a.action === "warning").length,
    history,
  }
}

// ── Guard: never let an admin suspend/remove an owner or fellow admin ──────────
async function assertTargetIsOrdinaryMember(homeId: string, targetUserId: string) {
  const [row] = await db
    .select({ role: homeMembership.role })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.userId, targetUserId)))
  if (!row) throw new Error("That member isn't in this Home.")
  const role = row.role as HomeRole
  if (role === "owner" || role === "administrator") {
    throw new Error("You can't moderate an owner or administrator.")
  }
}
