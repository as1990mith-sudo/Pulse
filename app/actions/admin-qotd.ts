"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { qotdQuestion } from "@/lib/db/schema"
import { requirePermission } from "@/lib/admin-auth"
import { logAudit } from "@/lib/audit"
import { listQuestions, publishQuestionRow, type QotdStatus } from "@/lib/qotd"

export type QotdInput = {
  questionText: string
  image?: string | null
  activeDate: string
}

function revalidate() {
  revalidatePath("/admin")
  revalidatePath("/admin/content/questions")
  revalidatePath("/chatrooms/questions")
  revalidatePath("/chatrooms")
}

/** Read wrapper (permission-gated) used by the admin client. */
export async function fetchQuestions(status: QotdStatus | "all" = "all") {
  await requirePermission("qotd.manage")
  return listQuestions(status)
}

function normalize(input: QotdInput) {
  const questionText = input.questionText.trim()
  const activeDate = input.activeDate.trim()
  if (!questionText) throw new Error("Question text is required")
  if (!activeDate) throw new Error("An active date is required")
  return { questionText, activeDate, image: input.image?.trim() || null }
}

/**
 * Creates a Question of the Day in a target lifecycle state.
 * - "published" makes it the live/featured question now and archives the previous.
 * - "scheduled" requires scheduledFor; it goes live automatically once due.
 * - "draft" is hidden until published.
 */
export async function createQuestion(
  input: QotdInput,
  target: { status: Extract<QotdStatus, "draft" | "scheduled" | "published">; scheduledFor?: string | null },
) {
  const actor = await requirePermission("qotd.manage")
  const data = normalize(input)

  let scheduledFor: Date | null = null
  if (target.status === "scheduled") {
    if (!target.scheduledFor) throw new Error("A schedule date is required")
    scheduledFor = new Date(target.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime())) throw new Error("Invalid schedule date")
  }

  const now = new Date()
  const [row] = await db
    .insert(qotdQuestion)
    .values({
      adminId: actor.userId,
      adminName: actor.name ?? "Admin",
      questionText: data.questionText,
      image: data.image,
      activeDate: data.activeDate,
      status: target.status === "published" ? "draft" : target.status,
      scheduledFor: target.status === "scheduled" ? scheduledFor : null,
      createdAt: now,
    })
    .returning({ id: qotdQuestion.id })

  // Publishing goes through the shared helper so the previous question is archived.
  if (target.status === "published") await publishQuestionRow(row.id)

  await logAudit({
    adminId: actor.userId,
    action: "qotd.create",
    targetType: "qotd_question",
    targetId: String(row.id),
    metadata: { status: target.status, hasImage: Boolean(data.image) },
  })
  revalidate()
  return { id: row.id }
}

/** Edits a question's content (text / image / active date). Lifecycle unchanged. */
export async function updateQuestion(id: number, input: QotdInput) {
  const actor = await requirePermission("qotd.manage")
  const data = normalize(input)
  await db
    .update(qotdQuestion)
    .set({ questionText: data.questionText, image: data.image, activeDate: data.activeDate })
    .where(eq(qotdQuestion.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "qotd.update",
    targetType: "qotd_question",
    targetId: String(id),
  })
  revalidate()
  return { ok: true }
}

/** Publishes a draft/scheduled/archived question now, archiving the previous live one. */
export async function publishQuestion(id: number) {
  const actor = await requirePermission("qotd.manage")
  await publishQuestionRow(id)
  await logAudit({
    adminId: actor.userId,
    action: "qotd.publish",
    targetType: "qotd_question",
    targetId: String(id),
  })
  revalidate()
  return { ok: true }
}

/** Schedules a question to go live at a future time. */
export async function scheduleQuestion(id: number, scheduledFor: string) {
  const actor = await requirePermission("qotd.manage")
  const when = new Date(scheduledFor)
  if (Number.isNaN(when.getTime())) throw new Error("Invalid schedule date")
  await db
    .update(qotdQuestion)
    .set({ status: "scheduled", scheduledFor: when, archivedAt: null })
    .where(eq(qotdQuestion.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "qotd.schedule",
    targetType: "qotd_question",
    targetId: String(id),
    metadata: { scheduledFor: when.toISOString() },
  })
  revalidate()
  return { ok: true }
}

/** Archives a question (hidden as featured, but its discussion is preserved). */
export async function archiveQuestion(id: number) {
  const actor = await requirePermission("qotd.manage")
  await db
    .update(qotdQuestion)
    .set({ status: "archived", archivedAt: new Date(), scheduledFor: null })
    .where(eq(qotdQuestion.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "qotd.archive",
    targetType: "qotd_question",
    targetId: String(id),
  })
  revalidate()
  return { ok: true }
}

/** Moves an archived/scheduled question back to draft so it can be edited. */
export async function restoreQuestion(id: number) {
  const actor = await requirePermission("qotd.manage")
  await db
    .update(qotdQuestion)
    .set({ status: "draft", scheduledFor: null, archivedAt: null })
    .where(eq(qotdQuestion.id, id))
  await logAudit({
    adminId: actor.userId,
    action: "qotd.restore",
    targetType: "qotd_question",
    targetId: String(id),
  })
  revalidate()
  return { ok: true }
}
