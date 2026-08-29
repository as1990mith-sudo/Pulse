"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

export function AppointmentsAdmin({
  handle,
  initialTypes,
  initialBookings,
}: {
  handle: string
  initialTypes: AppointmentTypeRow[]
  initialBookings: AdminAppointmentDetail[]
}) {
  const [tab, setTab] = useState<"types" | "bookings">("types")

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm">
        {(["types", "bookings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 font-semibold capitalize transition-colors",
              tab === t ? "text-white" : "text-muted-foreground hover:text-foreground",
            )}
            style={tab === t ? { backgroundColor: "var(--home-accent)" } : undefined}
          >
            {t === "types" ? "Types & availability" : "Bookings"}
          </button>
        ))}
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showForm ? "Cancel" : "New session type"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-4">
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
            <div key={t.id} className="overflow-hidden rounded-2xl border border-border bg-card">
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
                    <span>
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
    // Guard: end must be after start on every row.
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
      <div className="space-y-3">
        {WEEKDAYS.map((label, weekday) => {
          const dayWindows = windows
            .map((w, i) => ({ w, i }))
            .filter(({ w }) => w.weekday === weekday)
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
              {dayWindows.length === 0 && <span className="text-xs text-muted-foreground/60">—</span>}
              {dayWindows.map(({ w, i }) => (
                <div key={i} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1">
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

const STATUS_META: Record<string, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-primary/15 text-primary" },
  in_progress: { label: "In progress", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  pending_payment: { label: "Awaiting payment", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  completed: { label: "Finished", className: "bg-muted text-muted-foreground" },
  no_show: { label: "No show", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-destructive/15 text-destructive" },
}

function BookingsTab({ handle, initialBookings }: { handle: string; initialBookings: AdminAppointmentDetail[] }) {
  const [bookings, setBookings] = useState(initialBookings)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function complete(id: string) {
    setPendingId(id)
    startTransition(async () => {
      try {
        await completeAppointment(handle, id)
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "completed" } : b)))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update.")
      } finally {
        setPendingId(null)
      }
    })
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        title="No bookings yet"
        body="When members book one of your session types, their appointments appear here — each with its own conversation."
      />
    )
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {bookings.map((b) => {
        const meta = STATUS_META[b.status] ?? STATUS_META.upcoming
        const busy = pendingId === b.id
        return (
          <div key={b.id} className="flex flex-wrap items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{b.title}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.className)}>
                  {meta.label}
                </span>
                {b.paymentStatus === "paid" && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Paid
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                With {b.memberName}
                {b.priceCents != null ? ` · ${formatMoney(b.priceCents, b.currency)}` : ""}
              </p>
              <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3" /> {formatWhen(b.startsAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  {b.useFrequencyLive ? <Video className="size-3" /> : <MapPin className="size-3" />}
                  {b.useFrequencyLive ? "Frequency Live" : b.location ?? "In person"}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {b.conversationId && (
                  <Link
                    href={`/messages/${b.conversationId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    <MessageSquare className="size-3.5" />
                    Open Conversation
                  </Link>
                )}
                {b.useFrequencyLive &&
                  b.status !== "completed" &&
                  b.status !== "no_show" &&
                  b.status !== "cancelled" &&
                  b.paymentStatus !== "pending" && <JoinMeetingButton appointmentId={b.id} size="sm" />}
              </div>
            </div>
            {b.status !== "completed" && b.status !== "cancelled" && b.status !== "pending_payment" && (
              <button
                type="button"
                onClick={() => complete(b.id)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Mark finished
              </button>
            )}
          </div>
        )
      })}
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
