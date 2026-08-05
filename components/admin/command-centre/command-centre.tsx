"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  BookLock,
  Calendar,
  CheckCircle2,
  Database,
  Dot,
  FileText,
  Flag,
  LifeBuoy,
  type LucideIcon,
  MessageSquare,
  Radio,
  Send,
  Server,
  UserPlus,
  Users,
} from "lucide-react"
import { AdminCard, PageHeader, StatTile } from "@/components/admin/kit"
import { cn } from "@/lib/utils"
import type { ContentStatus, LiveActivity, ModerationQueue, PlatformHealth } from "@/lib/admin/command-centre"

type TimelineItem = {
  id: string
  action: string
  targetType: string | null
  result: string
  createdAt: string
}

const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "New Devotional", href: "/admin/content/devotionals", icon: Calendar },
  { label: "Send Announcement", href: "/admin/communication/broadcast", icon: Send },
  { label: "View Reports", href: "/admin/moderation/reports", icon: Flag },
  { label: "User Search", href: "/admin/users", icon: Users },
  { label: "Publish Broadcast", href: "/admin/communication/broadcast", icon: Radio },
  { label: "Platform Settings", href: "/admin/settings/general", icon: Server },
]

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function humanizeAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function CommandCentre({
  adminName,
  activity,
  queue,
  content,
  health,
  timeline,
}: {
  adminName: string
  activity: LiveActivity
  queue: ModerationQueue
  content: ContentStatus
  health: PlatformHealth
  timeline: TimelineItem[]
}) {
  const attentionTotal = queue.reports + queue.tickets + queue.pendingBooks
  const firstName = adminName.split(" ")[0]

  // Keep the dashboard figures genuinely live. This page is pure data (no
  // media/players/forms to disrupt), so a periodic server refresh is safe here
  // and re-runs the DB-backed metrics — including the real-time online count —
  // roughly every 15s while an admin is actively viewing the tab.
  const router = useRouter()
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const id = window.setInterval(tick, 15_000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [router])

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          attentionTotal > 0
            ? `${attentionTotal} item${attentionTotal === 1 ? "" : "s"} need your attention right now.`
            : "Everything is clear. Nothing needs your attention right now."
        }
      />

      {/* Moderation queue — the "what needs attention" answer, up top. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <AttentionTile
          label="Reports awaiting action"
          value={queue.reports}
          href="/admin/moderation/reports"
          icon={Flag}
          tone={queue.reports > 0 ? "warn" : "ok"}
        />
        <AttentionTile
          label="Support tickets open"
          value={queue.tickets}
          href="/admin/support/complaints"
          icon={LifeBuoy}
          tone={queue.tickets > 0 ? "warn" : "ok"}
        />
        <AttentionTile
          label="Books awaiting review"
          value={queue.pendingBooks}
          href="/admin/content/books"
          icon={BookLock}
          tone={queue.pendingBooks > 0 ? "warn" : "ok"}
        />
      </section>

      {/* Live activity */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Live activity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Online now" value={activity.online} icon={Users} />
          <StatTile label="Live streams" value={activity.streamsLive} icon={Radio} />
          <StatTile label="New today" value={activity.registrations} icon={UserPlus} />
          <StatTile label="Posts today" value={activity.posts} icon={MessageSquare} />
          <StatTile label="Comments today" value={activity.comments} icon={MessageSquare} />
          <StatTile label="Articles today" value={activity.articlesToday} icon={FileText} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Platform health */}
        <AdminCard title="Platform health" className="lg:col-span-1">
          <ul className="space-y-3">
            <HealthRow
              label="Database"
              icon={Database}
              ok={health.database.ok}
              detail={health.database.ok ? `${health.database.latencyMs}ms` : "unreachable"}
            />
            <HealthRow label="Server" icon={Server} unmonitored />
            <HealthRow label="API" icon={Activity} unmonitored />
            <HealthRow label="Storage" icon={Database} unmonitored />
            <HealthRow label="Background jobs" icon={Activity} unmonitored />
            <HealthRow label="Push service" icon={Send} unmonitored />
            <HealthRow label="CDN" icon={Server} unmonitored />
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Infrastructure signals connect to an external monitor. Only the database is measured in-app.
          </p>
        </AdminCard>

        {/* Content status */}
        <AdminCard title="Content status" className="lg:col-span-1">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today&apos;s devotional</p>
              {content.todayDevotional ? (
                <p className="mt-1 font-medium text-foreground">{content.todayDevotional.title}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">None published yet</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
              <MiniStat label="Devotionals" value={content.totalDevotionals} />
              <MiniStat label="Upcoming events" value={content.upcomingEvents} />
              <MiniStat label="Published books" value={content.publishedBooks} />
            </div>
          </div>
        </AdminCard>

        {/* Activity timeline */}
        <AdminCard title="Activity timeline" className="lg:col-span-1">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No administrative activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {timeline.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <Dot className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-foreground">
                      {humanizeAction(t.action)}
                      {t.targetType ? <span className="text-muted-foreground"> · {t.targetType}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{relTime(t.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-4 text-center transition-colors hover:border-primary/40 hover:bg-card"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-105">
                <a.icon className="size-5" />
              </span>
              <span className="text-xs font-medium leading-tight text-foreground">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function AttentionTile({
  label,
  value,
  href,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  href: string
  icon: LucideIcon
  tone: "warn" | "ok"
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between rounded-2xl border p-5 transition-all hover:shadow-lg",
        tone === "warn"
          ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
          : "border-border/60 bg-card/60 hover:border-border",
      )}
    >
      <div>
        <p className="text-3xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </div>
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105",
          tone === "warn" ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground",
        )}
      >
        {value > 0 ? <Icon className="size-5" /> : <CheckCircle2 className="size-5" />}
      </span>
    </Link>
  )
}

function HealthRow({
  label,
  icon: Icon,
  ok,
  detail,
  unmonitored,
}: {
  label: string
  icon: LucideIcon
  ok?: boolean
  detail?: string
  unmonitored?: boolean
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-foreground">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
      {unmonitored ? (
        <span className="text-xs text-muted-foreground">Not monitored</span>
      ) : (
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", ok ? "text-emerald-500" : "text-destructive")}>
          <span className={cn("size-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-destructive")} />
          {ok ? "Operational" : "Down"}
          {detail ? <span className="text-muted-foreground">· {detail}</span> : null}
        </span>
      )}
    </li>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
