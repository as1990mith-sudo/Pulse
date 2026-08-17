import type { Metadata } from "next"
import Link from "next/link"
import { requireHomeMembership } from "@/lib/home/access"
import { homeRoleHasPermission } from "@/lib/home/roles"
import { HomeHeader } from "@/components/home/home-header"
import { HomeOverviewBody } from "@/components/home/home-overview-body"
import { WelcomeBanner } from "@/components/home/welcome-banner"
import { Settings2 } from "lucide-react"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  return { title: `Home · ${handle}` }
}

export default async function HomeOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ welcome?: string }>
}) {
  const { handle } = await params
  const { welcome } = await searchParams
  // Privacy boundary: only ACTIVE members reach this. Non-members are redirected
  // to the join flow inside requireHomeMembership.
  const { home, membership } = await requireHomeMembership(handle)
  const canManage = homeRoleHasPermission(membership.role, "manage_settings")

  return (
    <main className="mx-auto min-h-svh w-full max-w-4xl pb-16">
      <HomeHeader
        home={home}
        action={
          canManage ? (
            <Link
              href={`/home/${handle}/admin`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur-sm transition-colors hover:bg-accent"
            >
              <Settings2 className="size-4" /> Admin
            </Link>
          ) : undefined
        }
      />

      <div className="px-5 sm:px-8">
        {welcome && <WelcomeBanner home={home} role={membership.role} />}
        <HomeOverviewBody home={home} role={membership.role} />
      </div>
    </main>
  )
}
