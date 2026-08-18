import Link from "next/link"
import { Users, Clock, ShieldCheck, ArrowUpRight } from "lucide-react"
import { getHomeAdminOverview, getActiveAuthKey } from "@/app/actions/home"
import { getHomePlan, formatHomePrice } from "@/lib/home/plans"
import { AuthKeyManager } from "@/components/home/admin/auth-key-manager"
import { EnterHomeLink } from "@/components/home/enter-home-link"

export default async function HomeAdminOverviewPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const [{ home, memberCount, pendingCount, adminCount }, authKey] = await Promise.all([
    getHomeAdminOverview(handle),
    getActiveAuthKey(handle),
  ])
  const plan = getHomePlan(home.plan)

  const stats = [
    { label: "Members", value: memberCount, icon: Users },
    { label: "Pending", value: pendingCount, icon: Clock },
    { label: "Admins", value: adminCount, icon: ShieldCheck },
  ]

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-balance lg:text-3xl">Overview</h1>
      </header>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</span>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums">{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Plan + view Home */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current plan</span>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold">{plan.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatHomePrice(plan)}
                <span className="text-muted-foreground/70">/month</span>
              </p>
            </div>
            <Link
              href={`/org/${handle}/admin/subscription`}
              className="inline-flex items-center gap-1 text-sm font-semibold"
              style={{ color: "var(--home-accent)" }}
            >
              Manage <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>

        <EnterHomeLink handle={handle} />
      </div>

      {/* Auth key + join policy */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Membership onboarding</h2>
        <AuthKeyManager handle={handle} initialKey={authKey} initialPolicy={home.joinPolicy} />
      </section>
    </div>
  )
}
