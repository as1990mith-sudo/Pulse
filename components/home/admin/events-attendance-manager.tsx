"use client"

import { useState, useTransition } from "react"
import { CalendarDays, Check, Clock, Loader2, MapPin, Trash2, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { orgDeleteEvent, type EventAttendance, type EventAttendee } from "@/app/actions/announcements"

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

export function EventsAttendanceManager({
  handle,
  events,
}: {
  handle: string
  events: EventAttendance[]
}) {
  const [rows, setRows] = useState(events)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  function remove(id: number) {
    setDeletingId(id)
    startTransition(async () => {
      try {
        await orgDeleteEvent(id)
        setRows((prev) => prev.filter((e) => e.id !== id))
      } finally {
        setDeletingId(null)
      }
    })
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-14 text-center">
        <div
          className="mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-elevated"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          <CalendarDays className="size-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">No events published yet</h2>
        <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Publish an event from the Events feed and you&apos;ll see here exactly who is coming and who
          can&apos;t make it.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((ev) => {
        const busy = deletingId === ev.id
        return (
          <article key={ev.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            {/* Event header */}
            <div className="flex flex-wrap items-start gap-3 border-b border-border p-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold tracking-tight">{ev.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" /> {formatWhen(ev.eventDate, ev.eventTime)}
                  </span>
                  {ev.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" /> {ev.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {ev.deleteMode === "manual" ? "Kept until deleted" : "Auto-removes 5h after start"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(ev.id)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Delete
              </button>
            </div>

            {/* Attendance summary + rosters */}
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <AttendanceColumn
                tone="coming"
                icon={<Check className="size-3.5" />}
                label="Coming"
                people={ev.coming}
              />
              <AttendanceColumn
                tone="not"
                icon={<X className="size-3.5" />}
                label="Can't make it"
                people={ev.notComing}
              />
            </div>
          </article>
        )
      })}
    </div>
  )
}

function AttendanceColumn({
  tone,
  icon,
  label,
  people,
}: {
  tone: "coming" | "not"
  icon: React.ReactNode
  label: string
  people: EventAttendee[]
}) {
  const toneClass =
    tone === "coming"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : "bg-destructive/15 text-destructive"
  return (
    <div className="rounded-xl border border-border bg-background/40">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <span className={cn("flex size-5 items-center justify-center rounded-full", toneClass)}>{icon}</span>
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums">{people.length}</span>
      </div>
      {people.length === 0 ? (
        <p className="flex items-center gap-1.5 px-3 py-4 text-xs text-muted-foreground">
          <Users className="size-3.5" /> No responses yet
        </p>
      ) : (
        <ul className="max-h-56 overflow-y-auto p-2">
          {people.map((p) => (
            <li key={p.userId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image || "/placeholder.svg"} alt="" className="size-7 shrink-0 rounded-full object-cover" />
              ) : (
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: p.color }}
                >
                  {p.initials}
                </span>
              )}
              <span className="truncate text-sm">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
