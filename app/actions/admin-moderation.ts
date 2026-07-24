"use server"

import { randomUUID } from "crypto"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  contentModerationState,
  contentReport,
  moderationAction,
  notification,
} from "@/lib/db/schema"
import { requirePermission } from "@/lib/admin-auth"
import { logAudit } from "@/lib/audit"
import { listReports, listRemovedContent, getContentHistory } from "@/lib/admin/reports"

/** Records a permanent moderation-history entry. */
async function record(
  adminId: string,
  targetType: string,
  targetId: string,
  action: string,
  reason: string | null,
  reportId?: string | null,
) {
  await db.insert(moderationAction).values({
    id: randomUUID(),
    targetType,
    targetId,
    action,
    reason: reason ?? null,
    adminId,
    reportId: reportId ?? null,
    createdAt: new Date(),
  })
}

/** Sends a system notification to the content's author, best-effort. */
async function notifyAuthor(userId: string | null, message: string) {
  if (!userId) return
  try {
    await db.insert(notification).values({
      userId,
      actorId: "system",
      actorName: "Frequency",
      type: "moderation",
      message,
      link: "/settings",
      read: false,
      createdAt: new Date(),
    })
  } catch {
    // never block a moderation action on a notification failure
  }
}

/** Re-fetch helpers used by the client after an action. */
export async function fetchReports(status: Parameters<typeof listReports>[0], page = 0) {
  await requirePermission("reports.view")
  return listReports(status, page)
}

export async function fetchRemovedContent(page = 0) {
  await requirePermission("reports.view")
  return listRemovedContent(page)
}

export async function fetchContentHistory(contentType: string, contentId: string) {
  await requirePermission("reports.view")
  return getContentHistory(contentType, contentId)
}

/** Marks a report as "reviewing" (claimed by a moderator). */
export async function markReviewing(reportId: string) {
  const actor = await requirePermission("reports.action")
  await db
    .update(contentReport)
    .set({ status: "reviewing", resolvedBy: actor.userId })
    .where(eq(contentReport.id, reportId))
  await logAudit({ adminId: actor.userId, action: "report.review", targetType: "report", targetId: reportId })
  revalidatePath("/admin/reports")
}

/** Dismisses a report with no action taken against the content. */
export async function dismissReport(reportId: string, reason: string) {
  const actor = await requirePermission("reports.action")
  const [report] = await db.select().from(contentReport).where(eq(contentReport.id, reportId)).limit(1)
  if (!report) throw new Error("Report not found")

  await db
    .update(contentReport)
    .set({ status: "dismissed", resolvedBy: actor.userId, resolvedAt: new Date() })
    .where(eq(contentReport.id, reportId))
  await record(actor.userId, report.contentType, report.contentId, "dismiss_report", reason, reportId)
  await logAudit({
    adminId: actor.userId,
    action: "report.dismiss",
    targetType: report.contentType,
    targetId: report.contentId,
    metadata: { reportId, reason },
  })
  revalidatePath("/admin/reports")
}

type EnforceInput = {
  contentType: string
  contentId: string
  reason: string
  authorId?: string | null
  reportId?: string | null
}

/** Sets content moderation state (hide/remove) and resolves related reports. */
async function enforce(state: "hidden" | "removed", input: EnforceInput) {
  const actor = await requirePermission("reports.action")
  const { contentType, contentId, reason, authorId, reportId } = input

  await db
    .insert(contentModerationState)
    .values({
      contentType,
      contentId,
      state,
      reason,
      moderatedBy: actor.userId,
      moderatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [contentModerationState.contentType, contentModerationState.contentId],
      set: { state, reason, moderatedBy: actor.userId, moderatedAt: new Date() },
    })

  // Resolve every open report against this content.
  await db
    .update(contentReport)
    .set({ status: "resolved", resolvedBy: actor.userId, resolvedAt: new Date() })
    .where(and(eq(contentReport.contentType, contentType), eq(contentReport.contentId, contentId)))

  await record(actor.userId, contentType, contentId, state === "hidden" ? "hide_content" : "remove_content", reason, reportId)
  await logAudit({
    adminId: actor.userId,
    action: state === "hidden" ? "content.hide" : "content.remove",
    targetType: contentType,
    targetId: contentId,
    metadata: { reason },
  })
  await notifyAuthor(
    authorId ?? null,
    state === "hidden"
      ? "Some of your content has been hidden by a moderator pending review."
      : "Some of your content has been removed for violating community guidelines.",
  )
  revalidatePath("/admin/reports")
}

export async function hideContent(input: EnforceInput) {
  await enforce("hidden", input)
}

export async function removeContent(input: EnforceInput) {
  await enforce("removed", input)
}

/** Restores previously hidden/removed content back to visible. */
export async function restoreContent(contentType: string, contentId: string, reason: string) {
  const actor = await requirePermission("reports.action")
  await db
    .insert(contentModerationState)
    .values({
      contentType,
      contentId,
      state: "visible",
      reason,
      moderatedBy: actor.userId,
      moderatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [contentModerationState.contentType, contentModerationState.contentId],
      set: { state: "visible", reason, moderatedBy: actor.userId, moderatedAt: new Date() },
    })
  await record(actor.userId, contentType, contentId, "restore_content", reason)
  await logAudit({
    adminId: actor.userId,
    action: "content.restore",
    targetType: contentType,
    targetId: contentId,
    metadata: { reason },
  })
  revalidatePath("/admin/reports")
}

/** Warns the author of reported content and resolves the report. */
export async function warnAuthor(input: EnforceInput) {
  const actor = await requirePermission("reports.action")
  const { contentType, contentId, reason, authorId, reportId } = input

  await db
    .update(contentReport)
    .set({ status: "resolved", resolvedBy: actor.userId, resolvedAt: new Date() })
    .where(and(eq(contentReport.contentType, contentType), eq(contentReport.contentId, contentId)))

  await record(actor.userId, contentType, contentId, "warn_author", reason, reportId)
  await logAudit({
    adminId: actor.userId,
    action: "content.warn",
    targetType: contentType,
    targetId: contentId,
    metadata: { reason, authorId },
  })
  await notifyAuthor(authorId ?? null, `Warning from the Frequency team: ${reason}`)
  revalidatePath("/admin/reports")
}
