import { and, count, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookSubmission, storeProduct } from "@/lib/db/schema"

export type SubmissionStatus = "pending" | "approved" | "rejected" | "changes_requested"

export type BookSubmissionRow = {
  id: string
  productId: string
  status: SubmissionStatus
  feedback: string | null
  submissionCount: number
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  // Product snapshot
  title: string
  subtitle: string
  author: string
  authorId: string
  cover: string
  category: string
  language: string
  pages: number | null
  priceCents: number
  fileUrl: string | null
  fileName: string | null
  published: boolean
}

const PAGE_SIZE = 20

// bookSubmission.productId is stored as text; storeProduct.id is an int.
// Cast on the join key so we can relate them without a schema migration.
const PRODUCT_ID_INT = sql`cast(${bookSubmission.productId} as integer)`

function mapRow(
  s: typeof bookSubmission.$inferSelect,
  p: typeof storeProduct.$inferSelect | undefined,
): BookSubmissionRow {
  return {
    id: s.id,
    productId: s.productId,
    status: s.status as SubmissionStatus,
    feedback: s.feedback,
    submissionCount: s.submissionCount,
    reviewedBy: s.reviewedBy,
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    title: p?.title ?? "(deleted book)",
    subtitle: p?.subtitle ?? "",
    author: p?.creatorName ?? "Unknown",
    authorId: p?.creatorId ?? "",
    cover: p?.coverUrl ?? "",
    category: p?.category ?? "",
    language: p?.language ?? "",
    pages: p?.pages ?? null,
    priceCents: p?.priceCents ?? 0,
    fileUrl: p?.bookFileUrl ?? null,
    fileName: p?.bookFileName ?? null,
    published: p?.published ?? false,
  }
}

/** Lists book submissions for a given status (or all), newest first, with the
 * joined product snapshot and status tab counts. */
export async function listBookSubmissions(
  status: SubmissionStatus | "all" = "pending",
  page = 0,
): Promise<{ rows: BookSubmissionRow[]; total: number; counts: Record<string, number> }> {
  const where = status === "all" ? undefined : eq(bookSubmission.status, status)

  const base = db
    .select({ s: bookSubmission, p: storeProduct })
    .from(bookSubmission)
    .leftJoin(storeProduct, eq(storeProduct.id, PRODUCT_ID_INT))

  const [rows, [totalRow], statusCounts] = await Promise.all([
    (where ? base.where(where) : base)
      .orderBy(desc(bookSubmission.createdAt))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    where
      ? db.select({ n: count() }).from(bookSubmission).where(where)
      : db.select({ n: count() }).from(bookSubmission),
    db.select({ status: bookSubmission.status, n: count() }).from(bookSubmission).groupBy(bookSubmission.status),
  ])

  const counts: Record<string, number> = { all: 0 }
  for (const c of statusCounts) {
    counts[c.status] = Number(c.n)
    counts.all += Number(c.n)
  }

  return {
    rows: rows.map((r) => mapRow(r.s, r.p ?? undefined)),
    total: Number(totalRow?.n ?? 0),
    counts,
  }
}

/** A single submission by id. */
export async function getBookSubmission(id: string): Promise<BookSubmissionRow | null> {
  const [row] = await db
    .select({ s: bookSubmission, p: storeProduct })
    .from(bookSubmission)
    .leftJoin(storeProduct, eq(storeProduct.id, PRODUCT_ID_INT))
    .where(eq(bookSubmission.id, id))
    .limit(1)
  if (!row) return null
  return mapRow(row.s, row.p ?? undefined)
}

/** Approval-centre analytics: totals, approval rate, and average time to
 * decision over reviewed submissions. */
export async function getBookApprovalStats() {
  const rows = await db.select().from(bookSubmission)
  const total = rows.length
  const pending = rows.filter((r) => r.status === "pending").length
  const approved = rows.filter((r) => r.status === "approved").length
  const rejected = rows.filter((r) => r.status === "rejected").length
  const changes = rows.filter((r) => r.status === "changes_requested").length
  const reviewed = rows.filter((r) => r.reviewedAt)

  let avgHours: number | null = null
  if (reviewed.length > 0) {
    const totalMs = reviewed.reduce((acc, r) => acc + (r.reviewedAt!.getTime() - r.createdAt.getTime()), 0)
    avgHours = Math.round(totalMs / reviewed.length / 3_600_000)
  }

  const decided = approved + rejected
  const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : null

  const [{ n: publishedBooks }] = await db
    .select({ n: count() })
    .from(storeProduct)
    .where(and(eq(storeProduct.kind, "book"), eq(storeProduct.published, true)))

  return {
    total,
    pending,
    approved,
    rejected,
    changes,
    avgHours,
    approvalRate,
    publishedBooks: Number(publishedBooks),
  }
}
