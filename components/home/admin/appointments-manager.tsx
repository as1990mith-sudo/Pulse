"use client"

import { useState, useTransition } from "react"
import { CalendarClock, Check, Loader2, MapPin, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  createAppointment,
  updateAppointmentStatus,
  type AppointmentRow,
} from "@/app/actions/home-scheduling"

const STATUS_META: Record<string, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  completed: { label: "Completed", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", className: "bg-destructive/15 text-destructive" },
}

function formatSlot(iso: string, endIso: string | null) {
  const start = new Date(iso)
  const startStr = start.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  if (!endIso) return startStr
  const end = new Date(endIso)
  return `${startStr} – ${end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
}

export function AppointmentsManager({
  handle,
  initialAppointments,
}: {
  handle: string
  initialAppointments: AppointmentRow[]
}) {
  const [appointments, setAppointments] = useState(initialAppointments)
  const [showForm, setShowForm] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const [, startTransition] = useTransition()

  // New-appointment form state.
  const [memberName, setMemberName] = useState("")
  const [title, setTitle] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [location, setLocation] = useState("")
  const [error, setError] = useState<string | null>(null)

  function setStatus(id: string, status: "completed" | "cancelled") {
    setPendingId(id)
    startTransition(async () => {
      await updateAppointmentStatus(handle, id, status)
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
      setPendingId(null)
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!memberName.trim() || !title.trim() || !startsAt) {
      setError("Member name, title and start time are required.")
      return
    }
    startSaving(async () => {
      try {
        await createAppointment({ handle, memberName, title, startsAt, location: location || undefined })
        // Optimistic prepend; server is source of truth on next load.
        setAppointments((prev) => [
          {
            id: crypto.randomUUID(),
            memberName,
            hostName: null,
            title,
            notes: null,
            location: location || null,
            startsAt: new Date(startsAt).toISOString(),
            endsAt: null,
            status: "upcoming",
          },
          ...prev,
        ])
        setMemberName("")
        setTitle("")
        setStartsAt("")
        setLocation("")
        setShowForm(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.")
      }
    })
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
          {showForm ? "Cancel" : "New appointment"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Member">
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Who is this appointment with?"
                className={inputClass}
              />
            </Field>
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Coaching session"
                className={inputClass}
              />
            </Field>
            <Field label="Starts at">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Location (optional)">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Main office / video call"
                className={inputClass}
              />
            </Field>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Schedule
          </button>
        </form>
      )}

      {appointments.length === 0 ? (
        <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-14 text-center">
          <div
            className="mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-elevated"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            <CalendarClock className="size-6" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">No appointments scheduled</h2>
          <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            Schedule an appointment between a member and your team to see it here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {appointments.map((a) => {
            const meta = STATUS_META[a.status] ?? STATUS_META.upcoming
            const busy = pendingId === a.id
            return (
              <div key={a.id} className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.className)}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    With {a.memberName}
                    {a.hostName ? ` · Host ${a.hostName}` : ""}
                  </p>
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="size-3" /> {formatSlot(a.startsAt, a.endsAt)}
                  </p>
                  {a.location && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {a.location}
                    </p>
                  )}
                </div>
                {a.status === "upcoming" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStatus(a.id, "completed")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(a.id, "cancelled")}
                      disabled={busy}
                      className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-60"
                      aria-label="Cancel appointment"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
