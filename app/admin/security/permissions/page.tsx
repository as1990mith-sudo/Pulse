import type { Metadata } from "next"
import { requirePermission } from "@/lib/admin-auth"
import { PermissionsView } from "@/components/admin/security/permissions-view"

export const metadata: Metadata = { title: "Permissions · Frequency Admin" }

export default async function PermissionsPage() {
  await requirePermission("security.view")
  return <PermissionsView />
}
