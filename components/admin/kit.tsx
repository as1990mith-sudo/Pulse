import type React from "react"
import { Loader2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** A centered loading spinner. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} />
}

/** A circular user avatar that shows an image when available, else colored initials. */
export function Avatar({
  name,
  src,
  initials,
  color,
  className,
}: {
  name: string
  src?: string | null
  initials: string
  color: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {src ? (
        <img src={src || "/placeholder.svg"} alt={name} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </div>
  )
}

/** Page title + optional description and right-aligned actions. */
export function PageHeader({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground ring-1 ring-inset ring-primary/20">
            <Icon className="size-5" />
          </div>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {description && <p className="max-w-2xl text-pretty text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** A glassy surface card used across the console. */
export function Panel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card/70 shadow-soft backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A Panel with a titled header and body padding — the default content card. */
export function AdminCard({
  title,
  action,
  className,
  children,
}: {
  title?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Panel className={cn("p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </Panel>
  )
}

/** A single KPI / metric tile. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = "default",
}: {
  label: string
  value: string | number
  icon?: LucideIcon
  hint?: string
  accent?: "default" | "primary" | "destructive" | "success" | "warning"
}) {
  const accentCls = {
    default: "text-muted-foreground",
    primary: "text-primary",
    destructive: "text-destructive",
    success: "text-emerald-500",
    warning: "text-amber-500",
  }[accent]
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("size-4", accentCls)} />}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Panel>
  )
}

/** Alias of StatCard for live-activity tiles (label + numeric value + icon). */
export const StatTile = StatCard

const BADGE_TONES: Record<string, string> = {
  success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  danger: "bg-red-500/12 text-red-600 dark:text-red-400 ring-red-500/20",
  info: "bg-sky-500/12 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  neutral: "bg-muted text-muted-foreground ring-border",
}

/** A small rounded status pill. */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "success" | "warning" | "danger" | "info" | "neutral"
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  operational: { dot: "bg-emerald-500", text: "text-emerald-500" },
  degraded: { dot: "bg-amber-500", text: "text-amber-500" },
  down: { dot: "bg-destructive", text: "text-destructive" },
  unknown: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
}

/** A small health/status indicator with a colored dot. */
export function StatusDot({
  status,
  label,
  pulse,
}: {
  status: "operational" | "degraded" | "down" | "unknown"
  label?: string
  pulse?: boolean
}) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.unknown
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex size-2.5">
        {pulse && status === "operational" && (
          <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", s.dot)} />
        )}
        <span className={cn("relative inline-flex size-2.5 rounded-full", s.dot)} />
      </span>
      {label && <span className={cn("text-xs font-medium", s.text)}>{label}</span>}
    </span>
  )
}

/** Elegant empty state with an illustrative icon halo. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center">
      <div className="relative flex size-16 items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-xl" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-card ring-1 ring-inset ring-border">
          <Icon className="size-7 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mx-auto max-w-sm text-pretty text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** A labeled section wrapper with an optional action on the right. */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
