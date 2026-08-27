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

const FILTERS: { key: RegistrationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "members", label: "Members" },
  { key: "non_members", label: "Non-members" },
  { key: "attended", label: "Attended" },
]

export function EventRegistrationsManager({
  handle,
  events,
}: {
  handle: string
  events: EventRegistrationSummary[]
}) {
  const [openId, setOpenId] = useState<number | null>(null)

  const registerable = useMemo(() => events.filter((e) => e.registrationEnabled), [events])

  if (registerable.length === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-14 text-center">
        <div
          className="mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-elevated"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          <UserPlus className="size-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">No events taking registrations</h2>
        <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Turn on registration for an event and everyone who signs up — members and visitors alike — will appear here
          with their details and answers.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {registerable.map((ev) => (
        <EventCard
          key={ev.id}
          handle={handle}
          event={ev}
          open={openId === ev.id}
          onToggle={() => setOpenId((cur) => (cur === ev.id ? null : ev.id))}
        />
      ))}
    </div>
  )
}

function EventCard({
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
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold tracking-tight">{event.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" /> {formatWhen(event.eventDate, event.eventTime)}
            </span>
            {event.capacity !== null ? (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                {event.counts.seats} of {event.capacity} places taken
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" /> Unlimited places
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/60"
        >
          {open ? "Hide" : "View registrations"}
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
      </div>

      {/* Counts stay visible whether or not the list is open: they are the
          number an admin most often just wants to glance at. */}
      <CountStrip counts={event.counts} />

      {open ? <RegistrationList handle={handle} event={event} /> : null}
    </article>
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
        <div key={it.label} className="border-r border-border px-3 py-2.5 last:border-r-0">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums leading-none">{it.value}</dd>
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
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter registrations">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                filter === f.key
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:bg-muted/60",
              )}
            >
              {f.label}
            </button>
          ))}
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
                    {r.attendedAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3" /> Attended
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {r.email}
                    {r.guests > 1 ? ` · party of ${r.guests}` : ""}
                  </span>
                </span>
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
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: "var(--home-accent)" }}
    >
      <UserCheck className="size-3" /> Member
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
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
          <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {row.fullName}
            <MemberBadge isMember={row.isMember} />
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
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
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{q.label}</dt>
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
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60",
            row.attendedAt
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "border border-border hover:bg-muted/60",
          )}
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
        <h5 className="text-[11px] uppercase tracking-wide text-muted-foreground">Event history</h5>
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
                <span className="shrink-0 tabular-nums text-muted-foreground">
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
