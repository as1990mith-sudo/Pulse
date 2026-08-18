"use client"

import { useMemo, useState, useTransition } from "react"
import { Check, Clock, Loader2, X, CalendarCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { updateBookingStatus, type BookingRow } from "@/app/actions/home-scheduling"

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  confirmed: { label: "Confirmed", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  completed: { label: "Completed", className: "bg-muted text-muted-foreground" },
  declined: { label: "Declined", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-destructive/15 text-destructive" },
}

const FILTERS = ["all", "pending", "confirmed", "completed"] as const

function formatDate(iso: string | null) {
  if (!iso) return "No preferred time"
  const d = new Date(iso)
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function BookingsManager({ handle, initialBookings }: { handle: string; initialBookings: BookingRow[] }) {
  const [bookings, setBookings] = useState(initialBookings)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const counts = useMemo(() => {
    return {
      all: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      completed: bookings.filter((b) => b.status === "completed").length,
    }
  }, [bookings])

  const visible = filter === "all" ? bookings : bookings.filter((b) => b.status === filter)

  function setStatus(id: string, status: "confirmed" | "declined" | "completed") {
    setPendingId(id)
    startTransition(async () => {
      await updateBookingStatus(handle, id, status)
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)))
      setPendingId(null)
    })
  }

  if (bookings.length === 0) {
    return (
      <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center">
        <div
          className="mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-elevated"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          <CalendarCheck className="size-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">No booking requests yet</h2>
        <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          When members request a booking inside your Home, it will appear here for you to confirm, decline or complete.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors",
              filter === f ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
            style={filter === f ? { backgroundColor: "var(--home-accent)" } : undefined}
          >
            {f} <span className="opacity-70">({counts[f]})</span>
          </button>
        ))}
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {visible.map((b) => {
          const meta = STATUS_META[b.status] ?? STATUS_META.pending
          const busy = pendingId === b.id
          return (
            <div key={b.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{b.title}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.className)}>
                    {meta.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {b.requesterName}
                  {b.requesterEmail ? ` · ${b.requesterEmail}` : ""}
                </p>
                {b.notes && <p className="mt-1.5 text-pretty text-sm text-muted-foreground">{b.notes}</p>}
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" /> {formatDate(b.requestedFor)}
                </p>
              </div>
              {b.status === "pending" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus(b.id, "confirmed")}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: "var(--home-accent)" }}
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(b.id, "declined")}
                    disabled={busy}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-60"
                    aria-label="Decline"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              {b.status === "confirmed" && (
                <button
                  type="button"
                  onClick={() => setStatus(b.id, "completed")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Mark complete
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
