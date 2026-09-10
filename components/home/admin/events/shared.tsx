import { UserCheck, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EventRegistrationSummary, RegistrationCounts } from "@/app/actions/event-admin"
import { EVENT_GENDER_LABEL, type EventGender } from "@/lib/events/questions"

/** Eyebrow — the label layer used for every caption and stat tag. Sans, not
 *  mono, matching the members console. Shared across the events surfaces. */
export const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.12em]"

export function formatWhen(date: string | null, time: string | null) {
  if (!date) return "Date TBC"
  const d = new Date(`${date}T${time ?? "00:00"}:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
}

export function formatDay(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Where an event sits in time, from its date alone. Drives the block it lands
 * in and the colour of its status dot. "live" is reserved for the day-of, so
 * the one red pulsing indicator never fires for a merely-soon event.
 */
export type EventStatus = "live" | "upcoming" | "past"

export function eventStatus(ev: { eventDate: string | null }): EventStatus {
  if (!ev.eventDate) return "upcoming" // Date TBC — treat as still to come.
  const d = new Date(`${ev.eventDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return "upcoming"
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (d.getTime() === today.getTime()) return "live"
  return d.getTime() > today.getTime() ? "upcoming" : "past"
}

/** Display label for a stored gender, or a neutral placeholder for legacy rows. */
export function genderLabel(g: EventGender | null): string {
  return g ? EVENT_GENDER_LABEL[g] : "Not set"
}

export function StatusDot({ kind }: { kind: EventStatus }) {
  // Red is spent only here, on the day-of indicator, and it pulses.
  if (kind === "live") {
    return (
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-live-pulse rounded-full bg-live" />
        <span className="relative inline-flex size-2 rounded-full bg-live" />
      </span>
    )
  }
  if (kind === "upcoming") {
    return <span className="size-2 rounded-full" style={{ backgroundColor: "var(--home-accent)" }} />
  }
  return <span className="size-2 rounded-full bg-muted-foreground/40" />
}

/**
 * Member-share donut: members / total registered, rendered as a CSS
 * conic-gradient with a punched hole the colour of the surface behind it. An
 * event with no registrations yet shows a dashed empty ring rather than a
 * misleading 0%.
 */
export function Ring({
  members,
  total,
  size = 34,
  hole = "var(--card)",
}: {
  members: number
  total: number
  size?: number
  hole?: string
}) {
  const pct = total > 0 ? Math.round((members / total) * 100) : null
  const thickness = size >= 48 ? 6 : 4

  if (pct === null) {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/40"
        style={{ width: size, height: size }}
        aria-label="No registrations yet"
      >
        <span className="text-[10px] text-muted-foreground">—</span>
      </div>
    )
  }

  const deg = (pct / 100) * 360
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--home-accent) ${deg}deg, color-mix(in oklch, var(--foreground) 14%, transparent) ${deg}deg 360deg)`,
        boxShadow: "0 0 12px -5px var(--home-accent)",
      }}
      role="img"
      aria-label={`${pct}% members`}
    >
      <div className="absolute rounded-full" style={{ inset: thickness, backgroundColor: hole }} />
      <span className={cn("relative font-display font-bold leading-none", size >= 48 ? "text-sm" : "text-[10px]")}>
        {pct}
        <span className="text-[0.6em]">%</span>
      </span>
    </div>
  )
}

export function CountStrip({ counts }: { counts: RegistrationCounts }) {
  const items = [
    { label: "Registered", value: counts.total },
    { label: "Members", value: counts.members },
    { label: "Guests", value: counts.nonMembers },
  ]
  return (
    <div className="border-t border-border/50">
      <dl className="grid grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className="border-r border-border/50 px-2.5 py-2.5 last:border-r-0">
            <dt className={cn(EYEBROW, "text-muted-foreground")}>{it.label}</dt>
            <dd className="mt-1 font-display text-lg font-bold tabular-nums leading-none">{it.value}</dd>
          </div>
        ))}
      </dl>
      <GenderBreakdown counts={counts} />
    </div>
  )
}

/**
 * The gender split of REGISTRATIONS, kept deliberately compact — a single line
 * of "52 Male · 69 Female · 7 Other" rather than charts or big cards. These are
 * registration counts, never attendance; the sr-only label makes that explicit
 * for screen readers. Legacy rows with no gender surface as "Not set" only when
 * present, so events registered before this field existed never show a stray 0.
 */
export function GenderBreakdown({ counts }: { counts: RegistrationCounts }) {
  if (counts.total === 0) return null
  const parts = [
    { label: "Male", value: counts.male },
    { label: "Female", value: counts.female },
    { label: "Other", value: counts.other },
  ]
  if (counts.unknownGender > 0) parts.push({ label: "Not set", value: counts.unknownGender })
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 px-2.5 py-2 text-[11px] tabular-nums">
      <span className="sr-only">Registrations by gender:</span>
      {parts.map((p, i) => (
        <span key={p.label} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="mr-1 text-muted-foreground/40">
              ·
            </span>
          ) : null}
          <span className="font-semibold text-foreground">{p.value}</span>
          <span className="text-muted-foreground">{p.label}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * Distinguishes a Home member from someone who only registered for this event.
 *
 * Given deliberately different weight and colour rather than two similar chips:
 * the whole point of the identity model is that an event registrant must never
 * be mistaken for a member of the church.
 */
export function MemberBadge({ isMember }: { isMember: boolean }) {
  return isMember ? (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white"
      style={{ backgroundColor: "var(--home-accent)" }}
    >
      <UserCheck className="size-3" /> Member
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      <UserPlus className="size-3" /> Registrant
    </span>
  )
}

/** Re-exported for consumers that only need the summary shape. */
export type { EventRegistrationSummary }
