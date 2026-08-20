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
      <header className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin Console</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance lg:text-3xl">Overview</h1>
      </header>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="rounded-2xl bg-card/60 p-5 shadow-soft ring-1 ring-inset ring-border/50 transition-shadow hover:shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {s.label}
                </span>
                <span
                  className="flex size-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "color-mix(in oklab, var(--home-accent) 12%, transparent)" }}
                >
                  <Icon className="size-4" style={{ color: "var(--home-accent)" }} />
                </span>
              </div>
              <p className="mt-3 font-display text-3xl font-semibold tabular-nums tracking-tight">{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Plan + view Home */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl bg-card/60 p-5 shadow-soft ring-1 ring-inset ring-border/50">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Current plan
          </span>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">{plan.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatHomePrice(plan)}
                <span className="text-muted-foreground/70">/month</span>
              </p>
            </div>
            <Link
              href={`/org/${handle}/admin/subscription`}
              className="tap-scale inline-flex items-center gap-1 text-sm font-semibold"
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
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Membership onboarding
        </h2>
        <AuthKeyManager handle={handle} initialKey={authKey} initialPolicy={home.joinPolicy} />
      </section>
    </div>
  )
}
