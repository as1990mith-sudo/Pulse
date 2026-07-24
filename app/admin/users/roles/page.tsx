import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { hasPermission } from "@/lib/rbac"
import { listAdminTeam } from "@/lib/admin/users"
import { AdminRolesView } from "@/components/admin/users/admin-roles-view"

export const metadata: Metadata = { title: "Admin Roles · Frequency Admin" }

export default async function AdminRolesPage() {
  const actor = await requirePermission("roles.manage")
  const team = await listAdminTeam()
  return <AdminRolesView initialTeam={team} canManage={hasPermission(actor.role, "roles.manage")} actorId={actor.userId} />
}
