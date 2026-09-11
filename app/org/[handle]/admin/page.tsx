import Link from "next/link"
import { Users, Clock, ShieldCheck, ArrowUpRight, ArrowRight } from "lucide-react"
import { getHomeAdminOverview, getActiveAuthKey } from "@/app/actions/home"
import { getViewerMembership } from "@/lib/home/access"
import { getHomePlan, formatHomePrice } from "@/lib/home/plans"
import { homeRoleHasPermission } from "@/lib/home/roles"
import { HOME_ADMIN_SECTIONS } from "@/lib/home/admin-nav"
import { AuthKeyManager } from "@/components/home/admin/auth-key-manager"
import { EnterHomeLink } from "@/components/home/enter-home-link"

export default async function HomeAdminOverviewPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const [{ home, memberCount, pendingCount, adminCount }, authKey] = await Promise.all([
    getHomeAdminOverview(handle),
    getActiveAuthKey(handle),
  ])
  const membership = await getViewerMembership(home.id)
  const role = membership?.role
  const plan = getHomePlan(home.plan)
  const base = `/org/${handle}/admin`

  const stats = [
    { label: "Members", value: memberCount, icon: Users, href: `${base}/members` },
    { label: "Pending", value: pendingCount, icon: Clock, href: `${base}/members`, alert: pendingCount > 0 },
    { label: "Admins", value: adminCount, icon: ShieldCheck, href: `${base}/admins` },
  ]

  // Quick actions reuse the real section registry so nothing speculative can
  // appear, and gate on the viewer's permissions exactly like the nav.
  const quickActions = HOME_ADMIN_SECTIONS.filter(
    (s) => s.slug !== "overview" && (!s.permission || (role && homeRoleHasPermission(role, s.permission))),
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">Overview</h1>
      </header>

      {/* Stat rail — real membership figures only */}
      <div className="grid grid-cols-3 gap-2.5">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Link
              key={s.label}
              href={s.href}
              className="tap-scale group rounded-2xl bg-card/60 p-3.5 shadow-soft ring-1 ring-inset ring-border/50 transition-shadow hover:shadow-elevated"
              style={{
                backgroundImage:
                  "linear-gradient(155deg, color-mix(in oklab, var(--home-accent) 9%, transparent), transparent 48%)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {s.label}
                </span>
                <span
                  className="flex size-6 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: s.alert
                      ? "color-mix(in oklab, var(--home-accent) 16%, transparent)"
                      : "color-mix(in oklab, var(--foreground) 6%, transparent)",
                    color: s.alert ? "var(--home-accent)" : undefined,
                  }}
                >
                  <Icon className="size-3.5" />
                </span>
              </div>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight">{s.value}</p>
            </Link>
          )
        })}
      </div>

      {/* Plan + view Home */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div
          className="flex items-center justify-between rounded-2xl bg-card/60 p-4 shadow-soft ring-1 ring-inset ring-border/50"
          style={{
            backgroundImage:
              "linear-gradient(135deg, color-mix(in oklab, var(--home-accent) 12%, transparent), transparent 55%)",
          }}
        >
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Plan</span>
            <p className="mt-0.5 truncate font-display text-base font-semibold tracking-tight">{plan.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatHomePrice(plan)}
              <span className="text-muted-foreground/70">/mo</span>
            </p>
          </div>
          <Link
            href={`${base}/subscription`}
            className="tap-scale inline-flex shrink-0 items-center gap-1 text-sm font-semibold"
            style={{ color: "var(--home-accent)" }}
          >
            Manage <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <EnterHomeLink handle={handle} />
      </div>

      {/* Quick actions — real sections only, permission-gated */}
      {quickActions.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Manage</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {quickActions.map((s) => {
              const Icon = s.icon
              return (
                <Link
                  key={s.slug}
                  href={`${base}/${s.slug}`}
                  className="tap-scale group flex items-center gap-2.5 rounded-2xl bg-card/60 p-3.5 shadow-soft ring-1 ring-inset ring-border/50 transition-shadow hover:shadow-elevated"
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "color-mix(in oklab, var(--foreground) 6%, transparent)" }}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.label}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Membership onboarding — auth key + join policy */}
      <section className="space-y-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Membership onboarding
        </h2>
        <AuthKeyManager handle={handle} initialKey={authKey} initialPolicy={home.joinPolicy} />
      </section>
    </div>
  )
}
