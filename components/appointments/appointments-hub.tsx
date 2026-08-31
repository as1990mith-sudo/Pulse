"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  ChevronLeft,
  Clock,
  Compass,
  CreditCard,
  HeartHandshake,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  Sparkles,
  Users,
  Video,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { JoinMeetingButton } from "@/components/appointments/join-meeting-button"
import { AppointmentCheckout } from "@/components/appointments/appointment-checkout"
import {
  bookAppointment,
  confirmAppointmentPaid,
  getOpenSlots,
  type AppointmentTypeRow,
  type MyAppointmentRow,
  type OpenSlot,
} from "@/app/actions/home-appointments"

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

function formatMoney(cents: number | null, currency: string) {
  if (cents == null) return "Free"
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
}
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
function isToday(iso: string) {
  return startOfDay(new Date(iso)).getTime() === startOfDay(new Date()).getTime()
}

/** Deterministic decorative icon for a session type (no icon field in schema). */
function typeIcon(title: string) {
  const t = title.toLowerCase()
  if (/(pray|worship|spirit)/.test(t)) return HeartHandshake
  if (/(counsel|consult|talk|chat|pastoral)/.test(t)) return MessageSquare
  if (/(coach|mentor|guide|career)/.test(t)) return Compass
  if (/(study|bible|class|teach|discipl)/.test(t)) return BookOpen
  if (/(group|team|community)/.test(t)) return Users
  return Sparkles
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Confirmed",
  in_progress: "In progress",
  pending_payment: "Awaiting payment",
  completed: "Completed",
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

function StatusPill({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status] ?? "bg-muted-foreground")} />
      {STATUS_LABEL[status] ?? status}
      {paymentStatus === "paid" ? " · Paid" : ""}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export function AppointmentsHub({
  appointments,
  bookableTypes,
  activeHandle,
  activeHomeName,
  hostMode = false,
  publishableKey,
  hideHeader = false,
}: {
  appointments: MyAppointmentRow[]
  bookableTypes: AppointmentTypeRow[]
  activeHandle: string | null
  activeHomeName: string | null
  hostMode?: boolean
  publishableKey: string
  /**
   * Drop the hero title + description. Used when the hub is embedded under a tab
   * (e.g. the Messages "Schedule" tab) that already provides its own heading, so
   * the schedule renders straight into the tab with no duplicate description.
   */
  hideHeader?: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<"list" | "book">("list")

  // Hosts never book — the page is their console of sessions booked with them.
  const canBook = !hostMode && bookableTypes.length > 0

  return (
    <div className={cn("mx-auto w-full max-w-2xl px-4 pb-28 sm:px-6", hideHeader ? "pt-1" : "pt-6")}>
      {!hideHeader && (
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0 pt-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">Appointments</h1>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">
              {hostMode
                ? "Sessions booked with you — each has its own conversation and meeting."
                : "Book time with the ministry team — each opens its own private conversation."}
            </p>
          </div>
          <div className="relative -mt-1 size-20 shrink-0 sm:size-28">
            <Image
              src="/images/appointments-hero.png"
              alt=""
              fill
              sizes="112px"
              priority
              className="object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]"
            />
          </div>
        </header>
      )}

      <div className={cn(!hideHeader && "mt-5")}>
        {view === "book" ? (
          <BookFlow
            bookableTypes={bookableTypes}
            activeHandle={activeHandle}
            activeHomeName={activeHomeName}
            publishableKey={publishableKey}
            onBack={() => setView("list")}
            onBooked={(conversationId) => {
              setView("list")
              router.refresh()
              if (conversationId) {
                toast.success("Appointment booked — opening your conversation.")
                router.push(`/messages/${conversationId}`)
              }
            }}
          />
        ) : (
          <MyAppointments
            appointments={appointments}
            canBook={canBook}
            hostMode={hostMode}
            activeHomeName={activeHomeName}
            onBook={() => setView("book")}
          />
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* My appointments — upcoming / past timeline                                 */
/* -------------------------------------------------------------------------- */

function MyAppointments({
  appointments,
  canBook,
  hostMode = false,
  activeHomeName,
  onBook,
}: {
  appointments: MyAppointmentRow[]
  canBook: boolean
  hostMode?: boolean
  activeHomeName: string | null
  onBook: () => void
}) {
  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const up: MyAppointmentRow[] = []
    const pa: MyAppointmentRow[] = []
    for (const a of appointments) {
      const done = a.status === "completed" || a.status === "no_show" || a.status === "cancelled"
      const ended = a.endsAt ? new Date(a.endsAt).getTime() < now : new Date(a.startsAt).getTime() < now
      if (done || ended) pa.push(a)
      else up.push(a)
    }
    up.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    pa.sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt))
    return { upcoming: up, past: pa }
  }, [appointments])

  if (appointments.length === 0) {
    return (
      <>
        {canBook && <BookCta onBook={onBook} />}
        <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-card/30 px-6 py-12 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary/10">
            <CalendarClock className="size-5 text-primary" />
          </div>
          <h2 className="mt-3 font-medium">No appointments yet</h2>
          <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">
            {hostMode
              ? "When a member books a session with you, it will appear here with its own conversation."
              : canBook
                ? `When you book a session${activeHomeName ? ` with ${activeHomeName}` : ""}, it will appear here.`
                : "When a session is available to book, it will show up here."}
          </p>
        </div>
      </>
    )
  }

  return (
    <div className="space-y-6">
      {canBook && <BookCta onBook={onBook} />}

      {upcoming.length > 0 && (
        <section>
          <SectionLabel>Upcoming</SectionLabel>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {upcoming.map((a) => (
              <AppointmentRow key={a.id} a={a} emphasize={isToday(a.startsAt)} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <SectionLabel>Past</SectionLabel>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {past.map((a) => (
              <AppointmentRow key={a.id} a={a} past />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
}

function BookCta({ onBook }: { onBook: () => void }) {
  return (
    <button
      type="button"
      onClick={onBook}
      className="group flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/12 to-primary/5 p-3.5 text-left transition-all hover:border-primary/50 hover:from-primary/16 active:scale-[0.99]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
        <CalendarClock className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Book an appointment</span>
        <span className="block truncate text-xs text-muted-foreground">Pick a session, date and time</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function AppointmentRow({ a, emphasize, past }: { a: MyAppointmentRow; emphasize?: boolean; past?: boolean }) {
  const canJoin =
    a.useFrequencyLive && a.status !== "completed" && a.status !== "no_show" && a.status !== "cancelled" && a.paymentStatus !== "pending"
  return (
    <li
      className={cn(
        "rounded-2xl border p-3.5 transition-colors",
        emphasize
          ? "border-primary/40 bg-primary/[0.06] ring-1 ring-inset ring-primary/20"
          : "border-border/60 bg-card/40 hover:border-border",
        past && "opacity-80",
      )}
    >
      <div className="flex items-stretch gap-3.5">
        {/* Time column */}
        <div
          className={cn(
            "flex w-16 shrink-0 flex-col items-center justify-center rounded-xl px-1 py-2 text-center",
            emphasize ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground",
          )}
        >
          <span className="text-sm font-semibold tabular-nums leading-tight">{formatTime(a.startsAt)}</span>
          <span
            className={cn(
              "mt-0.5 text-[10px] font-medium uppercase tracking-wide",
              emphasize ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {isToday(a.startsAt)
              ? "Today"
              : new Date(a.startsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </span>
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{a.title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {a.hostName ? `with ${a.hostName}` : a.homeName}
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            <StatusPill status={a.status} paymentStatus={a.paymentStatus} />
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              {a.useFrequencyLive ? <Video className="size-3" /> : <MapPin className="size-3" />}
              {a.durationMinutes} min
            </span>
          </div>
        </div>
      </div>

      {a.status !== "cancelled" && (a.conversationId || canJoin) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          {a.conversationId ? (
            <Link
              href={`/messages/${a.conversationId}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
            >
              <MessageSquare className="size-3.5" />
              Open conversation
            </Link>
          ) : null}
          {canJoin && <JoinMeetingButton appointmentId={a.id} size="sm" />}
        </div>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Booking flow                                                               */
/* -------------------------------------------------------------------------- */

function BookFlow({
  bookableTypes,
  activeHandle,
  activeHomeName,
  publishableKey,
  onBack,
  onBooked,
}: {
  bookableTypes: AppointmentTypeRow[]
  activeHandle: string | null
  activeHomeName: string | null
  publishableKey: string
  onBack: () => void
  onBooked: (conversationId: number | null) => void
}) {
  const [selectedType, setSelectedType] = useState<AppointmentTypeRow | null>(null)
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Paid flow: the Stripe client secret + the appointment awaiting reconcile.
  const [checkout, setCheckout] = useState<{ clientSecret: string; appointmentId: string } | null>(null)
  const [confirming, setConfirming] = useState(false)

  const chooseType = (type: AppointmentTypeRow) => {
    setSelectedType(type)
    setSelectedSlot(null)
    setSelectedDayKey(null)
    setSlots(null)
    if (!activeHandle) return
    setLoadingSlots(true)
    getOpenSlots(activeHandle, type.id)
      .then(setSlots)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not load times.")
        setSlots([])
      })
      .finally(() => setLoadingSlots(false))
  }

  const confirmBooking = () => {
    if (!activeHandle || !selectedType || !selectedSlot) return
    startTransition(async () => {
      try {
        const res = await bookAppointment({
          handle: activeHandle,
          typeId: selectedType.id,
          slotStartISO: selectedSlot,
        })
        if (res.kind === "confirmed") {
          onBooked(res.conversationId)
        } else {
          setCheckout({ clientSecret: res.clientSecret, appointmentId: res.appointmentId })
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not book that time.")
      }
    })
  }

  const onPaymentComplete = () => {
    if (!checkout) return
    setConfirming(true)
    confirmAppointmentPaid(checkout.appointmentId)
      .then((res) => {
        setCheckout(null)
        onBooked(res.conversationId)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Payment could not be confirmed.")
      })
      .finally(() => setConfirming(false))
  }

  // Group slots by calendar day for the date selector.
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

  // Default the date selection to the first available day.
  useEffect(() => {
    if (days.length > 0 && (!selectedDayKey || !days.some((d) => d.key === selectedDayKey))) {
      setSelectedDayKey(days[0].key)
    }
  }, [days, selectedDayKey])

  const activeDay = days.find((d) => d.key === selectedDayKey) ?? null

  if (!activeHandle) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 px-6 py-12 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Switch to one of your Homes to book an appointment with its team.
        </p>
        <button type="button" onClick={onBack} className="mt-4 text-sm font-semibold text-primary hover:underline">
          Back
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={selectedType ? () => setSelectedType(null) : onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {selectedType ? "All sessions" : "My appointments"}
      </button>

      {!selectedType ? (
        <div className="mt-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <p className="mb-3 text-sm text-muted-foreground">
            Choose a session{activeHomeName ? ` with ${activeHomeName}` : ""}.
          </p>
          <ul className="flex flex-col gap-2.5">
            {bookableTypes.map((t) => {
              const Icon = typeIcon(t.title)
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => chooseType(t)}
                    className="group flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-card/40 p-3.5 text-left transition-all hover:border-primary/50 hover:bg-card active:scale-[0.99]"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t.title}</span>
                      {t.description && (
                        <span className="mt-0.5 block line-clamp-1 text-xs leading-relaxed text-muted-foreground">
                          {t.description}
                        </span>
                      )}
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {t.durationMinutes} min
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {t.useFrequencyLive ? <Video className="size-3" /> : <MapPin className="size-3" />}
                          {t.useFrequencyLive ? "Frequency Live" : t.location ?? "In person"}
                        </span>
                        {t.hostName && <span className="truncate">· {t.hostName}</span>}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        t.priceCents == null ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
                      )}
                    >
                      {formatMoney(t.priceCents, t.currency)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="mt-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          {/* Selected session summary */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-border/60 bg-card/40 p-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {(() => {
                const Icon = typeIcon(selectedType.title)
                return <Icon className="size-5" />
              })()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selectedType.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedType.durationMinutes} min · {selectedType.useFrequencyLive ? "Frequency Live" : "In person"}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                selectedType.priceCents == null ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
              )}
            >
              {formatMoney(selectedType.priceCents, selectedType.currency)}
            </span>
          </div>

          {loadingSlots ? (
            <SlotSkeleton />
          ) : days.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
              No open times in the next few weeks. Please check back soon.
            </p>
          ) : (
            <>
              {/* Step 1 — date */}
              <StepHeading n={1}>Choose a date</StepHeading>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {days.map((d) => {
                  const active = d.key === selectedDayKey
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => {
                        setSelectedDayKey(d.key)
                        setSelectedSlot(null)
                      }}
                      className={cn(
                        "flex min-w-[4.25rem] flex-col items-center gap-0.5 rounded-2xl border px-3 py-2.5 transition-all active:scale-95",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                          : "border-border/60 bg-card/40 hover:border-primary/40",
                      )}
                    >
                      <span className={cn("text-[11px] font-medium uppercase", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
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

              {/* Step 2 — time */}
              <StepHeading n={2}>Choose a time</StepHeading>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {activeDay?.slots.map((s) => {
                  const active = selectedSlot === s.startISO
                  return (
                    <button
                      key={s.startISO}
                      type="button"
                      onClick={() => setSelectedSlot(s.startISO)}
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
            </>
          )}

          {/* Sticky selection bar */}
          {selectedSlot && (
            <div className="sticky bottom-4 z-10 mt-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              <div className="rounded-2xl border border-border bg-popover/95 p-3 shadow-floating backdrop-blur-md">
                <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <CalendarClock className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Your selection</p>
                      <p className="truncate text-sm font-semibold">
                        {formatFullDate(selectedSlot)} · {formatTime(selectedSlot)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-primary">
                    {formatMoney(selectedType.priceCents, selectedType.currency)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={confirmBooking}
                  disabled={isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : selectedType.priceCents == null ? (
                    <Check className="size-4" />
                  ) : (
                    <CreditCard className="size-4" />
                  )}
                  {isPending
                    ? "Booking…"
                    : selectedType.priceCents == null
                      ? "Confirm booking"
                      : `Continue to pay ${formatMoney(selectedType.priceCents, selectedType.currency)}`}
                  {!isPending && <ArrowRight className="size-4" />}
                </button>
                <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <Lock className="size-3" />
                  {selectedType.priceCents == null
                    ? "A private conversation opens automatically."
                    : "Secure booking · a private conversation opens after payment."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paid flow: embedded Stripe Checkout. */}
      <Dialog open={!!checkout} onOpenChange={(o) => !o && !confirming && setCheckout(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete payment</DialogTitle>
          </DialogHeader>
          {confirming ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Confirming your booking…
            </div>
          ) : checkout && publishableKey ? (
            <AppointmentCheckout
              clientSecret={checkout.clientSecret}
              publishableKey={publishableKey}
              onComplete={onPaymentComplete}
            />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Payments are not configured.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StepHeading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
        {n}
      </span>
      <h3 className="text-sm font-semibold">{children}</h3>
    </div>
  )
}

function SlotSkeleton() {
  return (
    <div className="mt-5">
      <div className="mb-2.5 h-4 w-28 rounded bg-muted/60" />
      <div className="-mx-1 flex gap-2 px-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[4.75rem] min-w-[4.25rem] rounded-2xl bg-muted/50 animate-pulse" />
        ))}
      </div>
      <div className="mb-2.5 mt-5 h-4 w-28 rounded bg-muted/60" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
