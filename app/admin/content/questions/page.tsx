import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/rbac"
import { listQuestions } from "@/lib/qotd"
import { QotdManager } from "@/components/admin/qotd/qotd-manager"

export const metadata: Metadata = { title: "Question of the Day · Frequency Admin" }

export default async function QotdAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>
}) {
  const actor = await requirePermission("qotd.manage")
  const { new: isNew } = await searchParams
  const initialRows = await listQuestions("all")
  return (
    <QotdManager
      initialRows={initialRows}
      canManage={hasPermission(actor.role, "qotd.manage")}
      openNew={isNew === "1"}
    />
  )
}
