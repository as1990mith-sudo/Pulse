"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { ACTIVITY_META, GENDER_LABEL, type ActivityLevel, type Gender } from "@/lib/home/members"
import { homeRoleLabel } from "@/lib/home/roles"

// ── Avatar ───────────────────────────────────────────────────────────────────
export function MemberAvatar({
  name,
  image,
  initials,
  color,
  className,
}: {
  name: string
  image: string | null
  initials: string
  color: string
  className?: string
}) {
  if (image) {
    return (
      <div className={cn("relative shrink-0 overflow-hidden rounded-full ring-1 ring-border/50", className)}>
        <Image src={image || "/placeholder.svg"} alt={name} fill className="object-cover" sizes="48px" />
      </div>
    )
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ring-border/40",
        color,
        className,
      )}
      aria-hidden
    >
      {initials}
    </div>
  )
}

// ── Activity indicator ───────────────────────────────────────────────────────
export function ActivityDot({ level, withLabel = false }: { level: ActivityLevel; withLabel?: boolean }) {
  const meta = ACTIVITY_META[level]
  if (!withLabel) {
    return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", meta.text)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

// ── Role badge ───────────────────────────────────────────────────────────────
export function RoleBadge({ role, status }: { role: string; status: "active" | "pending" }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-400/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        Pending
      </span>
    )
  }
  const isOwner = role === "owner"
  const isStaff = role !== "member"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        !isStaff && "bg-muted/60 text-muted-foreground",
      )}
      style={
        isOwner
          ? { backgroundColor: "color-mix(in oklab, var(--home-accent) 16%, transparent)", color: "var(--home-accent)" }
          : isStaff
            ? { backgroundColor: "color-mix(in oklab, var(--foreground) 8%, transparent)", color: "var(--foreground)" }
            : undefined
      }
    >
      {homeRoleLabel(role)}
    </span>
  )
}

export function GenderTag({ gender }: { gender: Gender | null }) {
  return <span className="text-muted-foreground">{gender ? GENDER_LABEL[gender] : "Not set"}</span>
}

// ── Segmented control ────────────────────────────────────────────────────────
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: "sm" | "md"
  ariaLabel?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-card/50 p-0.5 backdrop-blur"
    >
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "tap-scale rounded-full font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active ? "text-white shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
            style={active ? { backgroundColor: "var(--home-accent)" } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Responsive popover: anchored dropdown on desktop, bottom sheet on mobile ──
export function Popover({
  button,
  children,
  panelClassName,
  title,
}: {
  button: (open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  panelClassName?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}>
        {button(open)}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-black/40 backdrop-blur-[2px] animate-in fade-in sm:bg-transparent sm:backdrop-blur-0"
          />
          <div
            role="dialog"
            aria-modal="true"
            className={cn(
              "z-50 border border-border/60 bg-card/95 shadow-elevated backdrop-blur-xl",
              // Mobile: bottom sheet
              "fixed inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+0.5rem)] animate-in slide-in-from-bottom",
              // Desktop: anchored dropdown
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:max-h-none sm:w-72 sm:rounded-2xl sm:pb-0 sm:duration-150 sm:slide-in-from-top-1 sm:fade-in",
              panelClassName,
            )}
          >
            {title && (
              <p className="border-b border-border/50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:hidden">
                {title}
              </p>
            )}
            {children(close)}
          </div>
        </>
      )}
    </div>
  )
}

// ── Formatters ───────────────────────────────────────────────────────────────
const joinedFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
const longFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" })
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" })

export function formatJoined(iso: string, long = false): string {
  const d = new Date(iso)
  return (long ? longFmt : joinedFmt).format(d)
}

export function formatRelative(iso: string): string {
  const then = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = then.getTime()
  const dayMs = 86_400_000
  if (t >= startOfToday) return "Today"
  if (t >= startOfToday - dayMs) return "Yesterday"
  const days = Math.floor((startOfToday - t) / dayMs) + 1
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return joinedFmt.format(then)
}

export function formatTimelineStamp(iso: string): string {
  return `${formatRelative(iso)} · ${timeFmt.format(new Date(iso))}`
}

export function formatLastActive(iso: string | null): string {
  if (!iso) return "No activity yet"
  return formatRelative(iso)
}
