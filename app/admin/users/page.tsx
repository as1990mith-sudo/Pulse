import type { Metadata } from "next"
import { searchUsers } from "@/lib/admin/users"
import { requirePermission } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/rbac"
import { UserManagement } from "@/components/admin/users/user-management"

export const metadata: Metadata = { title: "User Management · Frequency Admin" }

export default async function UsersPage() {
  const actor = await requirePermission("users.view")
  const { rows, total } = await searchUsers("", 0)
  return (
    <UserManagement
      initialRows={rows}
      total={total}
      canModerate={hasPermission(actor.role, "users.moderate")}
      canManageRoles={hasPermission(actor.role, "roles.manage")}
    />
  )
}
