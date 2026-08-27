"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  CalendarDays,
  Check,
  ChevronRight,
  Loader2,
  Mail,
  Phone,
  Search,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getContactEventHistory,
  listEventRegistrations,
  type ContactHistoryEntry,
  type EventRegistrationSummary,
  type RegistrationCounts,
  type RegistrationFilter,
  type RegistrationRow,
} from "@/app/actions/event-admin"
import { setAttendance } from "@/app/actions/event-registration"
import type { EventQuestion } from "@/lib/events/questions"

function formatWhen(date: string | null, time: string | null) {
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

function formatDay(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Where an event sits in time, from its date alone. Drives the block it lands
 * in and the colour of its status dot. "live" is reserved for the day-of, so
 * the one red pulsing indicator never fires for a merely-soon event.
 */
type EventStatus = "live" | "upcoming" | "past"
function eventStatus(ev: EventRegistrationSummary): EventStatus {
  if (!ev.eventDate) return "upcoming" // Date TBC — treat as still to come.
  const d = new Date(`${ev.eventDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return "upcoming"
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (d.getTime() === today.getTime()) return "live"
  return d.getTime() > today.getTime() ? "upcoming" : "past"
}

const FILTERS: { key: RegistrationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "members", label: "Members" },
  { key: "non_members", label: "Non-members" },
  { key: "attended", label: "Attended" },
]

/** Mono eyebrow — the technical label layer used for every caption and stat tag. */
const EYEBROW = "font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"

export function EventRegistrationsManager({
  handle,
  events,
}: {
  handle: string
  events: EventRegistrationSummary[]
}) {
  const [openId, setOpenId] = useState<number | null>(null)

  const { live, upcoming, past } = useMemo(() => {
    const registerable = events.filter((e) => e.registrationEnabled)
    const live = registerable.filter((e) => eventStatus(e) === "live")
    const upcoming = registerable
      .filter((e) => eventStatus(e) === "upcoming")
      .sort((a, b) => (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999"))
    const past = registerable
      .filter((e) => eventStatus(e) === "past")
      .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""))
    return { live, upcoming, past }
  }, [events])

  const total = live.length + upcoming.length + past.length

  if (total === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-14 text-center">
        <div
          className="mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-elevated"
          style={{ backgroundColor: "var(--home-accent)", boxShadow: "0 0 26px -6px var(--home-accent)" }}
        >
          <UserPlus className="size-6" />
        </div>
        <h2 className="font-display text-lg font-bold tracking-tight">No events taking registrations</h2>
        <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Turn on registration for an event and everyone who signs up — members and visitors alike — will appear here
          with their details and answers.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      {live.length > 0 && (
        <Block label="Happening now" dot="live" count={live.length}>
          {live.map((ev) => (
            <EventCard
              key={ev.id}
              handle={handle}
              event={ev}
              status="live"
              open={openId === ev.id}
              onToggle={() => setOpenId((cur) => (cur === ev.id ? null : ev.id))}
            />
          ))}
        </Block>
      )}

      {upcoming.length > 0 && (
        <Block label="Upcoming" dot="upcoming" count={upcoming.length}>
          {upcoming.map((ev) => (
            <EventCard
              key={ev.id}
              handle={handle}
              event={ev}
              status="upcoming"
              open={openId === ev.id}
              onToggle={() => setOpenId((cur) => (cur === ev.id ? null : ev.id))}
            />
          ))}
        </Block>
      )}

      {past.length > 0 && (
        <Block label="Past" dot="past" count={past.length}>
          {past.map((ev) => (
            <PastRow
              key={ev.id}
              handle={handle}
              event={ev}
              open={openId === ev.id}
              onToggle={() => setOpenId((cur) => (cur === ev.id ? null : ev.id))}
            />
          ))}
        </Block>
      )}
    </div>
  )
}

/** Labelled section: status dot + mono eyebrow + hairline + right-aligned count. */
function Block({
  label,
  dot,
  count,
  children,
}: {
  label: string
  dot: EventStatus
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5 px-0.5">
        <StatusDot kind={dot} />
        <span className={cn(EYEBROW, "text-muted-foreground")}>{label}</span>
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {String(count).padStart(2, "0")}
        </span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function StatusDot({ kind }: { kind: EventStatus }) {
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
 * conic-gradient with a punched hole the colour of the card. An event with no
 * registrations yet shows a dashed empty ring rather than a misleading 0%.
 */
function Ring({ members, total, size = 34 }: { members: number; total: number; size?: number }) {
  const pct = total > 0 ? Math.round((members / total) * 100) : null
  const thickness = size >= 48 ? 6 : 4

  if (pct === null) {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/40"
        style={{ width: size, height: size }}
        aria-label="No registrations yet"
      >
        <span className="font-mono text-[10px] text-muted-foreground">—</span>
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
      <div className="absolute rounded-full bg-card" style={{ inset: thickness }} />
      <span className={cn("relative font-display font-bold leading-none", size >= 48 ? "text-sm" : "text-[10px]")}>
        {pct}
        <span className="text-[0.6em]">%</span>
      </span>
    </div>
  )
}

function EventCard({
  handle,
  event,
  status,
  open,
  onToggle,
}: {
  handle: string
  event: EventRegistrationSummary
  status: EventStatus
  open: boolean
  onToggle: () => void
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-card transition-colors",
        open ? "border-[color:var(--home-accent)]/40" : "border-border",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          {status === "live" && (
            <span className={cn(EYEBROW, "mb-1 flex items-center gap-1.5 text-live")}>Live today</span>
          )}
          {/* Wraps rather than truncates: event titles are long and often differ
              only near the end ("...Sunday Service" vs "...Sunday Seminar"), so
              clipping them made two different events look identical. */}
          <h3 className="text-pretty font-display text-base font-bold leading-tight tracking-tight">{event.title}</h3>
          <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0" /> {formatWhen(event.eventDate, event.eventTime)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5 shrink-0" />
              {event.capacity !== null
                ? `${event.counts.seats} of ${event.capacity} places taken`
                : "Unlimited places"}
            </span>
          </div>
        </div>

        {/* Ring at a glance + a square accent-tinted drill-in control. */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <Ring members={event.counts.members} total={event.counts.total} />
          <span className={cn(EYEBROW, "text-muted-foreground")}>Members</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Hide registrations" : `View registrations for ${event.title}`}
          className="grid size-9 shrink-0 place-items-center rounded-xl border transition-colors"
          style={{
            backgroundColor: "color-mix(in oklch, var(--home-accent) 14%, transparent)",
            borderColor: "color-mix(in oklch, var(--home-accent) 30%, transparent)",
            color: "var(--home-accent)",
          }}
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        </button>
      </div>

      <CountStrip counts={event.counts} />

      {open ? <RegistrationList handle={handle} event={event} /> : null}
    </article>
  )
}

/**
 * A past event collapses to a single low-opacity line — no card, no chart —
 * until tapped, when it expands into the same registration list so attendance
 * can still be reviewed after the fact.
 */
function PastRow({
  handle,
  event,
  open,
  onToggle,
}: {
  handle: string
  event: EventRegistrationSummary
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className={cn("rounded-xl", open && "border border-border bg-card")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 px-1 py-2 text-left transition-opacity",
          open ? "px-4 opacity-100" : "opacity-55 hover:opacity-90",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-semibold">{event.title}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {formatWhen(event.eventDate, event.eventTime)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-display text-sm font-bold tabular-nums">{event.counts.total}</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Registered</span>
        </span>
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open ? <RegistrationList handle={handle} event={event} /> : null}
    </div>
  )
}

function CountStrip({ counts }: { counts: RegistrationCounts }) {
  const items = [
    { label: "Registered", value: counts.total },
    { label: "Members", value: counts.members },
    { label: "Non-members", value: counts.nonMembers },
    { label: "Attended", value: counts.attended },
  ]
  return (
    <dl className="grid grid-cols-4 border-t border-border">
      {items.map((it) => (
        <div key={it.label} className="border-r border-border px-2.5 py-2.5 last:border-r-0">
          <dt className={cn(EYEBROW, "text-muted-foreground")}>{it.label}</dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums leading-none">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function RegistrationList({ handle, event }: { handle: string; event: EventRegistrationSummary }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<RegistrationFilter>("all")
  const [rows, setRows] = useState<RegistrationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<RegistrationRow | null>(null)

  // Guards against a slow earlier request overwriting a newer one's results,
  // which would show the wrong rows for what is currently typed.
  const reqId = useRef(0)

  const load = useCallback(
    async (q: string, f: RegistrationFilter) => {
      const mine = ++reqId.current
      setLoading(true)
      setError(null)
      try {
        const res = await listEventRegistrations({ handle, announcementId: event.id, query: q, filter: f })
        if (mine !== reqId.current) return
        setRows(res.rows)
      } catch (e) {
        if (mine !== reqId.current) return
        setError(e instanceof Error ? e.message : "Could not load registrations.")
      } finally {
        if (mine === reqId.current) setLoading(false)
      }
    },
    [handle, event.id],
  )

  // Debounced so typing a name does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(query, filter), query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, filter, load])

  return (
    <div className="border-t border-border">
      <div className="flex flex-col gap-3 p-4">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search registrations for {event.title}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or mobile"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2"
            style={{ ["--tw-ring-color" as string]: "var(--home-accent)" }}
          />
        </label>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter registrations">
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={cn(
                  "rounded-lg px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                  active ? "text-white" : "border border-border text-muted-foreground hover:bg-muted/60",
                )}
                style={active ? { backgroundColor: "var(--home-accent)", boxShadow: "0 0 14px -6px var(--home-accent)" } : undefined}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {error}
        </p>
      ) : loading ? (
        <p className="flex items-center gap-2 px-4 pb-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          {query || filter !== "all" ? "Nobody matches that search." : "No registrations yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.fullName}</span>
                    <MemberBadge isMember={r.isMember} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {r.email}
                    {r.guests > 1 ? ` · party of ${r.guests}` : ""}
                  </span>
                </span>
                {r.attendedAt ? (
                  <Check className="size-4 shrink-0" style={{ color: "var(--home-accent)" }} aria-label="Attended" />
                ) : null}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <RegistrationDetail
          handle={handle}
          questions={event.questions}
          row={selected}
          onClose={() => setSelected(null)}
          onAttendanceChange={(attendedAt) => {
            setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, attendedAt } : r)))
            setSelected((cur) => (cur ? { ...cur, attendedAt } : cur))
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Distinguishes a Home member from someone who only registered for this event.
 *
 * Given deliberately different weight and colour rather than two similar chips:
 * the whole point of the plan's identity model is that an event registrant must
 * never be mistaken for a member of the church.
 */
function MemberBadge({ isMember }: { isMember: boolean }) {
  return isMember ? (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white"
      style={{ backgroundColor: "var(--home-accent)" }}
    >
      <UserCheck className="size-3" /> Member
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      <UserPlus className="size-3" /> Registrant
    </span>
  )
}

function RegistrationDetail({
  handle,
  questions,
  row,
  onClose,
  onAttendanceChange,
}: {
  handle: string
  questions: EventQuestion[]
  row: RegistrationRow
  onClose: () => void
  onAttendanceChange: (attendedAt: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [history, setHistory] = useState<ContactHistoryEntry[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getContactEventHistory({ handle, contactId: row.contactId })
      .then((h) => {
        if (alive) setHistory(h)
      })
      .catch(() => {
        if (alive) setHistory([])
      })
    return () => {
      alive = false
    }
  }, [handle, row.contactId])

  function toggleAttendance() {
    const next = !row.attendedAt
    startTransition(async () => {
      const res = await setAttendance({ registrationId: row.id, attended: next })
      if (!res.ok) {
        setErr(res.error ?? "Could not update attendance.")
        return
      }
      setErr(null)
      onAttendanceChange(next ? new Date().toISOString() : null)
    })
  }

  const answered = questions.filter((q) => row.answers && row.answers[q.id] !== undefined && row.answers[q.id] !== "")

  return (
    <div className="border-t border-border bg-background/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex flex-wrap items-center gap-2 font-display text-sm font-bold">
            {row.fullName}
            <MemberBadge isMember={row.isMember} />
          </h4>
          <p className={cn(EYEBROW, "mt-1 text-muted-foreground")}>
            Registered {formatDay(row.createdAt)} · {row.source === "member" ? "in the app" : "public page"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/60"
        >
          <X className="size-3.5" />
          <span className="sr-only">Close details</span>
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        <a href={`mailto:${row.email}`} className="inline-flex items-center gap-2 text-muted-foreground hover:underline">
          <Mail className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{row.email}</span>
        </a>
        {row.phone ? (
          <a href={`tel:${row.phone}`} className="inline-flex items-center gap-2 text-muted-foreground hover:underline">
            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
            {row.phone}
          </a>
        ) : null}
        {row.guests > 1 ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Users className="size-3.5 shrink-0" aria-hidden="true" />
            Party of {row.guests}
          </span>
        ) : null}
      </div>

      {/* Marketing consent is shown explicitly. An admin composing a broadcast
          needs to know this, and it is the one fact most easily got wrong. */}
      <p className="mt-3 text-xs text-muted-foreground">
        {row.marketingOptIn
          ? "Opted in to news and updates."
          : "Event emails only — has not opted in to marketing."}
      </p>

      {answered.length > 0 ? (
        <dl className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          {answered.map((q) => (
            <div key={q.id}>
              <dt className={cn(EYEBROW, "text-muted-foreground")}>{q.label}</dt>
              <dd className="mt-0.5 text-sm">{String(row.answers?.[q.id])}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleAttendance}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] disabled:opacity-60",
            !row.attendedAt && "border border-border hover:bg-muted/60",
          )}
          style={
            row.attendedAt
              ? {
                  backgroundColor: "color-mix(in oklch, var(--home-accent) 16%, transparent)",
                  color: "var(--home-accent)",
                }
              : undefined
          }
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {row.attendedAt ? "Marked as attended" : "Mark as attended"}
        </button>
      </div>
      {err ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {err}
        </p>
      ) : null}

      <div className="mt-4">
        <h5 className={cn(EYEBROW, "text-muted-foreground")}>Event history</h5>
        {history === null ? (
          <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Loading…
          </p>
        ) : history.length <= 1 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">First event with this church.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1">
            {history.map((h) => (
              <li key={h.registrationId} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{h.title}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] tabular-nums text-muted-foreground">
                  {h.status === "cancelled" ? "Cancelled" : h.attendedAt ? "Attended" : "Registered"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
