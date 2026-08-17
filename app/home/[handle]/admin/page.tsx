import { redirect } from "next/navigation"

// The admin console now lives under the organisation area at
// /org/[handle]/admin. Preserve any old bookmarks by redirecting.
export default async function LegacyHomeAdminRedirect({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  redirect(`/org/${handle}/admin`)
}
