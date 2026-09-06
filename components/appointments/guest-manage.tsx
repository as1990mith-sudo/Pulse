"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  MapPin,
  Video,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAppointmentCall } from "@/components/appointments/appointment-call-provider"
import {
  cancelAppointmentByToken,
  getRescheduleSlotsByToken,
  rescheduleAppointmentByToken,
  type ManageView,
} from "@/app/actions/public-appointments"
import type { OpenSlot } from "@/lib/appointments/core"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}
function formatFullDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
}
function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Confirmed",
  in_progress: "In progress",
  pending_payment: "Awaiting payment",
  completed: "Finished",
  no_show: "No show",
  cancelled: "Cancelled",
}
const STATUS_DOT: Record<string, string> = {
  upcoming: "bg-primary",
  in_progress: "bg-emerald-500",
  pending_payment: "bg-amber-500",
  completed: "bg-muted-foreground",
  no_show: "bg-destructive",
  cancelled: "bg-destructive",
}

export function GuestManage({ initial }: { initial: ManageView }) {
  const { startCall } = useAppointmentCall()
  const [view, setView] = useState<ManageView>(initial)
  const [mode, setMode] = useState<"overview" | "reschedule">("overview")

  const isCancelled = view.status === "cancelled"
  const isOver = view.status === "completed" || view.status === "no_show"
  const canManage = !isCancelled && !isOver

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6">
      {mode === "reschedule" ? (
        <Reschedule
          token={view.manageToken}
          onBack={() => setMode("overview")}
          onDone={(startISO, endISO) => {
            setView((v) => ({ ...v, startISO, endISO, status: "upcoming" }))
            setMode("overview")
          }}
        />
      ) : (
        <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/90">Your appointment</p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold leading-tight tracking-tight text-balance">
            {view.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            with {view.hostName ?? view.homeName} · {view.homeName}
          </p>

          <div className="mt-5 rounded-2xl border border-border/60 bg-card/40 p-4">
            <StatusRow status={view.status} />
            <dl className="mt-4 flex flex-col gap-3">
              <DetailRow icon={CalendarClock} label="When">
                {formatFullDate(view.startISO)}
                <span className="text-muted-foreground"> · </span>
                {formatTime(view.startISO)} – {formatTime(view.endISO)}
              </DetailRow>
              <DetailRow icon={Clock} label="Duration">
                {view.durationMinutes} min
              </DetailRow>
              <DetailRow icon={view.useFrequencyLive ? Video : MapPin} label="Where">
                {view.useFrequencyLive ? "Video call" : view.location ?? "In person"}
              </DetailRow>
            </dl>
          </div>

          {isCancelled ? (
            <p className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-center text-sm text-destructive">
              This appointment was cancelled.
            </p>
          ) : isOver ? (
            <p className="mt-5 rounded-2xl border border-border/60 bg-card/40 px-4 py-4 text-center text-sm text-muted-foreground">
              This appointment has ended.
            </p>
          ) : (
            <div className="mt-5 flex flex-col gap-2.5">
              {view.useFrequencyLive && (
                <JoinRow
                  view={view}
                  onJoin={() =>
                    startCall({
                      manageToken: view.manageToken,
                      title: view.title,
                      counterpartName: view.hostName ?? view.homeName,
                      selfName: view.bookerName,
                      startWithVideo: true,
                    })
                  }
                />
              )}
              {canManage && (
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMode("reschedule")}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                  >
                    Reschedule
                  </button>
                  <CancelButton
                    token={view.manageToken}
                    onCancelled={() => setView((v) => ({ ...v, status: "cancelled" }))}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusRow({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className={cn("size-2 rounded-full", STATUS_DOT[status] ?? "bg-muted-foreground")} />
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CalendarClock
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{children}</dd>
      </div>
    </div>
  )
}

function JoinRow({ view, onJoin }: { view: ManageView; onJoin: () => void }) {
  const isOpen = view.meetingWindow === "open"
  const opensAt = new Date(view.opensAtISO)
  if (view.meetingWindow === "closed") return null
  return (
    <button
      type="button"
      disabled={!isOpen}
      onClick={onJoin}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all",
        isOpen
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110 active:scale-[0.98]"
          : "cursor-not-allowed bg-primary/15 text-primary ring-1 ring-inset ring-primary/30",
      )}
    >
      <Video className="size-4" />
      {isOpen
        ? "Join meeting"
        : `Opens ${opensAt.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
    </button>
  )
}

function CancelButton({ token, onCancelled }: { token: string; onCancelled: () => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const confirm = () => {
    setError(null)
    start(async () => {
      try {
        await cancelAppointmentByToken(token)
        setOpen(false)
        onCancelled()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not cancel.")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
      >
        <XCircle className="size-4" />
        Cancel
      </button>
      <Dialog open={open} onOpenChange={(o) => !o && !isPending && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this appointment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This frees the time slot for others and lets the host know. This can&apos;t be undone.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={confirm}
              className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
              Cancel appointment
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Reschedule                                                                 */
/* -------------------------------------------------------------------------- */

function Reschedule({
  token,
  onBack,
  onDone,
}: {
  token: string
  onBack: () => void
  onDone: (startISO: string, endISO: string) => void
}) {
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  useEffect(() => {
    let alive = true
    getRescheduleSlotsByToken(token)
      .then((s) => alive && setSlots(s))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load times."))
    return () => {
      alive = false
    }
  }, [token])

  const days = useMemo(() => {
    const map = new Map<string, { date: Date; slots: OpenSlot[] }>()
    for (const s of slots ?? []) {
      const d = new Date(s.startISO)
      const key = startOfDay(d).toISOString()
      const entry = map.get(key) ?? { date: d, slots: [] }
      entry.slots.push(s)
      map.set(key, entry)
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v }))
  }, [slots])

  useEffect(() => {
    if (days.length > 0 && (!dayKey || !days.some((d) => d.key === dayKey))) setDayKey(days[0].key)
  }, [days, dayKey])

  const activeDay = days.find((d) => d.key === dayKey) ?? null

  const submit = () => {
    if (!selected) return
    setError(null)
    // Use the slot's real end time (start + duration) for the optimistic view,
    // never the start again — otherwise "When" renders "10:30 – 10:30".
    const endISO = (slots ?? []).find((s) => s.startISO === selected)?.endISO ?? selected
    start(async () => {
      try {
        await rescheduleAppointmentByToken(token, selected)
        onDone(selected, endISO)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not reschedule.")
      }
    })
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back
      </button>
      <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">Pick a new time</h2>

      {slots === null && !error ? (
        <p className="mt-6 flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading times…
        </p>
      ) : error ? (
        <p className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
          {error}
        </p>
      ) : days.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
          No other open times right now.
        </p>
      ) : (
        <>
          <div className="mb-2.5 mt-5 text-sm font-semibold">Date</div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {days.map((d) => {
              const active = d.key === dayKey
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => {
                    setDayKey(d.key)
                    setSelected(null)
                  }}
                  className={cn(
                    "flex min-w-[4.25rem] flex-col items-center gap-0.5 rounded-2xl border px-3 py-2.5 transition-all active:scale-95",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "border-border/60 bg-card/40 hover:border-primary/40",
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] font-medium uppercase",
                      active ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {d.date.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="text-xl font-semibold tabular-nums leading-none">{d.date.getDate()}</span>
                  <span className={cn("text-[11px]", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {d.date.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mb-2.5 mt-5 text-sm font-semibold">Time</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {activeDay?.slots.map((s) => {
              const active = selected === s.startISO
              return (
                <button
                  key={s.startISO}
                  type="button"
                  onClick={() => setSelected(s.startISO)}
                  className={cn(
                    "relative rounded-xl border py-2.5 text-sm font-medium tabular-nums transition-all active:scale-95",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                      : "border-border/60 bg-card/40 hover:border-primary/50",
                  )}
                >
                  {active && (
                    <Check className="absolute right-1.5 top-1.5 size-3 text-primary-foreground" strokeWidth={3} />
                  )}
                  {formatTime(s.startISO)}
                </button>
              )
            })}
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          {selected && (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {isPending ? "Rescheduling…" : `Move to ${formatTime(selected)}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
