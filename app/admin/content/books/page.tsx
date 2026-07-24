import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/rbac"
import { listBookSubmissions, getBookApprovalStats } from "@/lib/admin/books"
import { BooksApproval } from "@/components/admin/books/books-approval"

export const metadata: Metadata = { title: "Books Approval · Frequency Admin" }

export default async function BooksPage() {
  const actor = await requirePermission("books.review")
  const [{ rows, total, counts }, stats] = await Promise.all([
    listBookSubmissions("pending", 0),
    getBookApprovalStats(),
  ])
  return (
    <BooksApproval
      initialRows={rows}
      initialTotal={total}
      initialCounts={counts}
      stats={stats}
      canApprove={hasPermission(actor.role, "books.review")}
    />
  )
}
