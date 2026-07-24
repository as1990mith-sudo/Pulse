"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { bookSubmission, notification, storeProduct } from "@/lib/db/schema"
import { requirePermission } from "@/lib/admin-auth"
import { logAudit } from "@/lib/audit"
import { getBookSubmission, listBookSubmissions, getBookApprovalStats } from "@/lib/admin/books"
import type { SubmissionStatus } from "@/lib/admin/books"

/** Client re-fetch helpers (permission-guarded). */
export async function fetchBookSubmissions(status: SubmissionStatus | "all", page = 0) {
  await requirePermission("books.review")
  return listBookSubmissions(status, page)
}

export async function fetchBookStats() {
  await requirePermission("books.review")
  return getBookApprovalStats()
}

async function notifyAuthor(userId: string, message: string, link = "/store/listings") {
  if (!userId) return
  try {
    await db.insert(notification).values({
      userId,
      actorId: "system",
      actorName: "Frequency",
      type: "book_review",
      message,
      link,
      read: false,
      createdAt: new Date(),
    })
  } catch {
    // best-effort
  }
}

/** Loads a submission and asserts the acting admin may review it. */
async function loadForReview(submissionId: string) {
  const actor = await requirePermission("books.review")
  const submission = await getBookSubmission(submissionId)
  if (!submission) throw new Error("Submission not found")
  return { actor, submission }
}

/** Approve a book: publish the product, mark the submission approved, notify. */
export async function approveBook(submissionId: string, note?: string) {
  const { actor, submission } = await loadForReview(submissionId)

  await db
    .update(storeProduct)
    .set({ published: true })
    .where(eq(storeProduct.id, Number(submission.productId)))

  await db
    .update(bookSubmission)
    .set({
      status: "approved",
      feedback: note?.trim() || null,
      reviewedBy: actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookSubmission.id, submissionId))

  await logAudit({
    adminId: actor.userId,
    action: "book.approve",
    targetType: "book",
    targetId: submission.productId,
    metadata: { title: submission.title, note },
  })
  await notifyAuthor(
    submission.authorId,
    `Your book "${submission.title}" has been approved and is now live in the store.`,
    `/store/book/${submission.productId}`,
  )

  revalidatePath("/admin/books")
  revalidatePath("/store")
}

/** Reject a book: keep it unpublished, record feedback, notify the author. */
export async function rejectBook(submissionId: string, feedback: string) {
  const { actor, submission } = await loadForReview(submissionId)
  if (!feedback.trim()) throw new Error("Feedback is required when rejecting.")

  await db
    .update(storeProduct)
    .set({ published: false })
    .where(eq(storeProduct.id, Number(submission.productId)))

  await db
    .update(bookSubmission)
    .set({
      status: "rejected",
      feedback: feedback.trim(),
      reviewedBy: actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookSubmission.id, submissionId))

  await logAudit({
    adminId: actor.userId,
    action: "book.reject",
    targetType: "book",
    targetId: submission.productId,
    metadata: { title: submission.title, feedback },
  })
  await notifyAuthor(
    submission.authorId,
    `Your book "${submission.title}" was not approved. Reviewer feedback: ${feedback.trim()}`,
  )

  revalidatePath("/admin/books")
}

/** Request changes: author can revise and resubmit; stays unpublished. */
export async function requestBookChanges(submissionId: string, feedback: string) {
  const { actor, submission } = await loadForReview(submissionId)
  if (!feedback.trim()) throw new Error("Feedback is required when requesting changes.")

  await db
    .update(bookSubmission)
    .set({
      status: "changes_requested",
      feedback: feedback.trim(),
      reviewedBy: actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookSubmission.id, submissionId))

  await logAudit({
    adminId: actor.userId,
    action: "book.request_changes",
    targetType: "book",
    targetId: submission.productId,
    metadata: { title: submission.title, feedback },
  })
  await notifyAuthor(
    submission.authorId,
    `Changes were requested for your book "${submission.title}": ${feedback.trim()}`,
  )

  revalidatePath("/admin/books")
}
