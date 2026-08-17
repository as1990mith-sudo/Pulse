import { notFound, redirect } from "next/navigation"
import { getHomeByHandle, getViewerMembership } from "@/lib/home/access"
import { isHomeAdminRole } from "@/lib/home/roles"
import { HomeAdminShell } from "@/components/home/admin/home-admin-shell"

// Guards the entire admin console: the Home must exist, the viewer must be a
// member, and their role must permit console access. Non-admin members are
// bounced to the member-facing Home; non-members get a 404 (privacy — they
// must not learn the Home exists).
export default async function HomeAdminLayout({
  params,
  children,
}: {
  params: Promise<{ handle: string }>
  children: React.ReactNode
}) {
  const { handle } = await params
  const home = await getHomeByHandle(handle)
  if (!home) notFound()

  const membership = await getViewerMembership(home.id)
  if (!membership || membership.status !== "active") notFound()
  if (!isHomeAdminRole(membership.role)) redirect(`/home/${handle}`)

  return (
    <HomeAdminShell home={home} role={membership.role}>
      {children}
    </HomeAdminShell>
  )
}
