"use client"

import { useMemo, useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Trash2,
  Video,
  Wallet,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { JoinMeetingButton } from "@/components/appointments/join-meeting-button"
import {
  createAppointmentType,
  updateAppointmentType,
  setAvailability,
  completeAppointment,
  type AdminAppointmentDetail,
  type AppointmentTypeRow,
  type AvailabilityWindow,
} from "@/app/actions/home-appointments"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function minutesToTime(min: number) {
  const h = String(Math.floor(min / 60)).padStart(2, "0")
  const m = String(min % 60).padStart(2, "0")
  return `${h}:${m}`
}
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
function formatMoney(cents: number | null, currency: string) {
  if (cents == null) return "Free"
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
}
function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

/* -------------------------------------------------------------------------- */
/* Root                                                                       */
/* -------------------------------------------------------------------------- */

export function AppointmentsAdmin({
  handle,
  initialTypes,
  initialBookings,
}: {
  handle: string
  initialTypes: AppointmentTypeRow[]
  initialBookings: AdminAppointmentDetail[]
}) {
  const [tab, setTab] = useState<"types" | "bookings">("bookings")

  return (
    <div className="space-y-6">
      <OverviewBand bookings={initialBookings} typeCount={initialTypes.length} />

      <div className="flex items-center gap-1 border-b border-border">
        {(
          [
            { key: "bookings", label: "Bookings", icon: CalendarDays, count: initialBookings.length },
            { key: "types", label: "Types & availability", icon: Clock, count: initialTypes.length },
          ] as const
        ).map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-current"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              style={active ? { color: "var(--home-accent)" } : undefined}
            >
              <t.icon className="size-4" />
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  active ? "bg-[color-mix(in_oklab,var(--home-accent)_18%,transparent)]" : "bg-muted text-muted-foreground",
                )}
                style={active ? { color: "var(--home-accent)" } : undefined}
              >
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {tab === "types" ? (
        <TypesTab handle={handle} initialTypes={initialTypes} />
      ) : (
        <BookingsTab handle={handle} initialBookings={initialBookings} />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Overview band                                                              */
/* -------------------------------------------------------------------------- */

function OverviewBand({ bookings, typeCount }: { bookings: AdminAppointmentDetail[]; typeCount: number }) {
  const stats = useMemo(() => {
    let upcoming = 0
    let awaiting = 0
    let completed = 0
    let collected = 0
    let currency = "usd"
    for (const b of bookings) {
      if (b.status === "upcoming" || b.status === "in_progress") upcoming++
      else if (b.status === "pending_payment") awaiting++
      else if (b.status === "completed") completed++
      if (b.paymentStatus === "paid" && b.priceCents) {
        collected += b.priceCents
        currency = b.currency
      }
    }
    return { upcoming, awaiting, completed, collected, currency }
  }, [bookings])

  const tiles = [
    { label: "Upcoming", value: String(stats.upcoming), icon: CalendarClock },
    { label: "Awaiting payment", value: String(stats.awaiting), icon: CreditCard },
    { label: "Completed", value: String(stats.completed), icon: Check },
    { label: "Collected", value: formatMoney(stats.collected, stats.currency), icon: Wallet },
  ]

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-10 size-40 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: "var(--home-accent)" }}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Appointments console
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
            {typeCount === 0 ? "Set up your first session type" : "Manage sessions & bookings"}
          </h2>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
            Every booking opens its own private conversation and, when live, a scheduled meeting room.
          </p>
        </div>
        <div className="relative -mr-1 -mt-2 hidden size-24 shrink-0 sm:block">
          <Image
            src="/images/appointments-hero.png"
            alt=""
            fill
            sizes="96px"
            className="object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
          />
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border/70 bg-background/60 p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <t.icon className="size-3.5" />
              <span className="text-[11px] font-medium">{t.label}</span>
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{t.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Types & availability                                                       */
/* -------------------------------------------------------------------------- */

function TypesTab({ handle, initialTypes }: { handle: string; initialTypes: AppointmentTypeRow[] }) {
  const [types, setTypes] = useState(initialTypes)
  const [showForm, setShowForm] = useState(initialTypes.length === 0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [duration, setDuration] = useState("30")
  const [priceDollars, setPriceDollars] = useState("")
  const [useFrequencyLive, setUseFrequencyLive] = useState(true)
  const [location, setLocation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const durationMinutes = Number(duration)
    if (!title.trim() || !Number.isFinite(durationMinutes) || durationMinutes < 5) {
      setError("A title and a duration of at least 5 minutes are required.")
      return
    }
    const priceCents = priceDollars.trim() ? Math.round(Number(priceDollars) * 100) : null
    if (priceCents != null && (!Number.isFinite(priceCents) || priceCents < 0)) {
      setError("Enter a valid price, or leave it blank for a free session.")
      return
    }
    startSaving(async () => {
      try {
        const { id } = await createAppointmentType({
          handle,
          title,
          description: description || undefined,
          durationMinutes,
          priceCents,
          useFrequencyLive,
          location: useFrequencyLive ? null : location || null,
        })
        setTypes((prev) => [
          {
            id,
            title: title.trim(),
            description: description.trim() || null,
            durationMinutes,
            priceCents: priceCents && priceCents > 0 ? priceCents : null,
            currency: "usd",
            useFrequencyLive,
            location: useFrequencyLive ? null : location.trim() || null,
            active: true,
            hostUserId: null,
            hostName: null,
            windows: [],
          },
          ...prev,
        ])
        setTitle("")
        setDescription("")
        setDuration("30")
        setPriceDollars("")
        setLocation("")
        setShowForm(false)
        setExpandedId(id)
        toast.success("Session type created — now add availability so members can book.")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.")
      }
    })
  }

  async function toggleActive(t: AppointmentTypeRow) {
    const next = !t.active
    setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: next } : x)))
    try {
      await updateAppointmentType({ handle, id: t.id, patch: { active: next } })
    } catch (err) {
      setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: t.active } : x)))
      toast.error(err instanceof Error ? err.message : "Could not update.")
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define the sessions members can book, then set weekly availability for each.
        </p>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showForm ? "Cancel" : "New session type"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft animate-in fade-in-0 slide-in-from-top-2 duration-200"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 1:1 Prayer & Counsel"
                className={inputClass}
              />
            </Field>
            <Field label="Duration (minutes)">
              <input
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Price (leave blank for free)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </Field>
            <Field label="Meeting">
              <div className="flex items-center gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setUseFrequencyLive(true)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    useFrequencyLive ? "border-transparent text-white" : "border-border text-muted-foreground",
                  )}
                  style={useFrequencyLive ? { backgroundColor: "var(--home-accent)" } : undefined}
                >
                  <Video className="size-3.5" />
                  Frequency Live
                </button>
                <button
                  type="button"
                  onClick={() => setUseFrequencyLive(false)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    !useFrequencyLive ? "border-transparent text-white" : "border-border text-muted-foreground",
                  )}
                  style={!useFrequencyLive ? { backgroundColor: "var(--home-accent)" } : undefined}
                >
                  <MapPin className="size-3.5" />
                  In person
                </button>
              </div>
            </Field>
          </div>
          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this session for?"
              className={inputClass}
            />
          </Field>
          {!useFrequencyLive && (
            <Field label="Location">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Main office, Room 2"
                className={inputClass}
              />
            </Field>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Create type
          </button>
        </form>
      )}

      {types.length === 0 ? (
        <EmptyState
          title="No session types yet"
          body="Create a session type, set its availability, and members can book it from their Appointments."
        />
      ) : (
        <div className="space-y-3">
          {types.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <div className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        t.priceCents == null ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
                      )}
                    >
                      {formatMoney(t.priceCents, t.currency)}
                    </span>
                    {!t.active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Hidden
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {t.durationMinutes} min
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {t.useFrequencyLive ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}
                      {t.useFrequencyLive ? "Frequency Live" : t.location ?? "In person"}
                    </span>
                    <span
                      className={cn(
                        t.windows.length === 0 && "font-medium text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {t.windows.length} availability window{t.windows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(t)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    {t.active ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedId((id) => (id === t.id ? null : t.id))}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    Availability
                    <ChevronDown
                      className={cn("size-3.5 transition-transform", expandedId === t.id && "rotate-180")}
                    />
                  </button>
                </div>
              </div>
              {expandedId === t.id && (
                <AvailabilityEditor
                  handle={handle}
                  type={t}
                  onSaved={(windows) => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, windows } : x)))}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AvailabilityEditor({
  handle,
  type,
  onSaved,
}: {
  handle: string
  type: AppointmentTypeRow
  onSaved: (windows: AvailabilityWindow[]) => void
}) {
  const [windows, setWindows] = useState<AvailabilityWindow[]>(type.windows)
  const [saving, startSaving] = useTransition()

  function addWindow(weekday: number) {
    setWindows((prev) => [...prev, { weekday, startMinute: 9 * 60, endMinute: 17 * 60 }])
  }
  function removeWindow(index: number) {
    setWindows((prev) => prev.filter((_, i) => i !== index))
  }
  function patchWindow(index: number, patch: Partial<AvailabilityWindow>) {
    setWindows((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)))
  }

  function save() {
    for (const w of windows) {
      if (w.endMinute <= w.startMinute) {
        toast.error("Each window's end time must be after its start time.")
        return
      }
    }
    startSaving(async () => {
      try {
        await setAvailability({ handle, typeId: type.id, windows })
        onSaved(windows)
        toast.success("Availability saved.")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save availability.")
      }
    })
  }

  return (
    <div className="border-t border-border bg-muted/30 p-4">
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Set the recurring weekly windows you&apos;re available. Members can book any {type.durationMinutes}-minute slot
        inside these windows (times are in UTC).
      </p>
      <div className="space-y-2">
        {WEEKDAYS.map((label, weekday) => {
          const dayWindows = windows.map((w, i) => ({ w, i })).filter(({ w }) => w.weekday === weekday)
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-2 rounded-lg px-1 py-1">
              <span className="w-10 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
              {dayWindows.length === 0 && <span className="text-xs text-muted-foreground/60">—</span>}
              {dayWindows.map(({ w, i }) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1"
                >
                  <input
                    type="time"
                    value={minutesToTime(w.startMinute)}
                    onChange={(e) => patchWindow(i, { startMinute: timeToMinutes(e.target.value) })}
                    className="bg-transparent text-xs outline-none"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <input
                    type="time"
                    value={minutesToTime(w.endMinute)}
                    onChange={(e) => patchWindow(i, { endMinute: timeToMinutes(e.target.value) })}
                    className="bg-transparent text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeWindow(i)}
                    className="ml-0.5 text-muted-foreground hover:text-destructive"
                    aria-label="Remove window"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addWindow(weekday)}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background"
              >
                <Plus className="size-3.5" />
                Add
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--home-accent)" }}
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Save availability
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

const STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  upcoming: { label: "Upcoming", className: "bg-primary/15 text-primary", dot: "bg-primary" },
  in_progress: {
    label: "In progress",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  pending_payment: {
    label: "Awaiting payment",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  completed: { label: "Finished", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  no_show: { label: "No show", className: "bg-destructive/15 text-destructive", dot: "bg-destructive" },
  cancelled: { label: "Cancelled", className: "bg-destructive/15 text-destructive", dot: "bg-destructive" },
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "pending_payment", label: "Awaiting payment" },
  { key: "completed", label: "Finished" },
] as const

function BookingsTab({ handle, initialBookings }: { handle: string; initialBookings: AdminAppointmentDetail[] }) {
  const [bookings, setBookings] = useState(initialBookings)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all")
  const [selected, setSelected] = useState<AdminAppointmentDetail | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function complete(id: string) {
    setPendingId(id)
    startTransition(async () => {
      try {
        await completeAppointment(handle, id)
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "completed" } : b)))
        setSelected((cur) => (cur && cur.id === id ? { ...cur, status: "completed" } : cur))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update.")
      } finally {
        setPendingId(null)
      }
    })
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length }
    for (const b of bookings) {
      const key = b.status === "in_progress" ? "upcoming" : b.status
      c[key] = (c[key] ?? 0) + 1
    }
    return c
  }, [bookings])

  const visible = useMemo(() => {
    if (filter === "all") return bookings
    if (filter === "upcoming") return bookings.filter((b) => b.status === "upcoming" || b.status === "in_progress")
    return bookings.filter((b) => b.status === filter)
  }, [bookings, filter])

  if (bookings.length === 0) {
    return (
      <EmptyState
        title="No bookings yet"
        body="When members book one of your session types, their appointments appear here — each with its own conversation."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground",
              )}
              style={active ? { backgroundColor: "var(--home-accent)" } : undefined}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-white/20" : "bg-muted",
                )}
              >
                {counts[f.key] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
          No bookings in this view.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          {visible.map((b) => {
            const meta = STATUS_META[b.status] ?? STATUS_META.upcoming
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelected(b)}
                className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/40"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: "var(--home-accent)" }}
                  aria-hidden
                >
                  {initials(b.memberName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{b.memberName}</p>
                    <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline", meta.className)}>
                      {meta.label}
                    </span>
                    {b.paymentStatus === "paid" && (
                      <span className="hidden shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary sm:inline">
                        Paid
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{b.title}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full sm:hidden", meta.dot)} />
                    <CalendarClock className="size-3" />
                    {formatWhen(b.startsAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {b.priceCents != null && (
                    <span className="hidden text-sm font-semibold tabular-nums sm:inline">
                      {formatMoney(b.priceCents, b.currency)}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <BookingDetailSheet
        booking={selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onComplete={complete}
        completing={pendingId}
      />
    </div>
  )
}

function BookingDetailSheet({
  booking,
  onOpenChange,
  onComplete,
  completing,
}: {
  booking: AdminAppointmentDetail | null
  onOpenChange: (open: boolean) => void
  onComplete: (id: string) => void
  completing: string | null
}) {
  const b = booking
  const meta = b ? STATUS_META[b.status] ?? STATUS_META.upcoming : STATUS_META.upcoming
  const canComplete =
    b && b.status !== "completed" && b.status !== "cancelled" && b.status !== "pending_payment"
  const canJoin =
    b &&
    b.useFrequencyLive &&
    b.status !== "completed" &&
    b.status !== "no_show" &&
    b.status !== "cancelled" &&
    b.paymentStatus !== "pending"

  return (
    <Sheet open={!!b} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        {b && (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b border-border p-5">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: "var(--home-accent)" }}
                  aria-hidden
                >
                  {initials(b.memberName)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-semibold tracking-tight">{b.memberName}</h2>
                  <span className={cn("mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.className)}>
                    {meta.label}
                    {b.paymentStatus === "paid" ? " · Paid" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <DetailRow icon={CalendarDays} label="Session">
                {b.title}
              </DetailRow>
              <DetailRow icon={CalendarClock} label="Date & time">
                {formatWhen(b.startsAt)}
              </DetailRow>
              <DetailRow icon={Clock} label="Duration">
                {b.durationMinutes} minutes
              </DetailRow>
              <DetailRow icon={b.useFrequencyLive ? Video : MapPin} label="Meeting">
                {b.useFrequencyLive ? "Frequency Live" : b.location ?? "In person"}
              </DetailRow>
              <DetailRow icon={CreditCard} label="Payment">
                {b.priceCents == null
                  ? "Free session"
                  : `${formatMoney(b.priceCents, b.currency)} · ${
                      b.paymentStatus === "paid" ? "Paid" : b.paymentStatus === "pending" ? "Awaiting payment" : b.paymentStatus
                    }`}
              </DetailRow>
              {b.notes && (
                <DetailRow icon={MessageSquare} label="Notes">
                  <span className="whitespace-pre-wrap">{b.notes}</span>
                </DetailRow>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 border-t border-border p-5">
              {canJoin && <JoinMeetingButton appointmentId={b.id} className="w-full justify-center" />}
              {b.conversationId && (
                <Link
                  href={`/messages/${b.conversationId}`}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  <MessageSquare className="size-4" />
                  Open conversation
                </Link>
              )}
              {canComplete && (
                <button
                  type="button"
                  onClick={() => onComplete(b.id)}
                  disabled={completing === b.id}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {completing === b.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Mark finished
                </button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-pretty">{children}</p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-14 text-center">
      <div
        className="mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-elevated"
        style={{ backgroundColor: "var(--home-accent)" }}
      >
        <CalendarClock className="size-6" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
