"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  CalendarClock,
  Check,
  ChevronLeft,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
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

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  pending_payment: "Awaiting payment",
  completed: "Finished",
  no_show: "No show",
  cancelled: "Cancelled",
}

function StatusChip({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  const tone =
    status === "completed"
      ? "bg-muted text-muted-foreground"
      : status === "no_show"
        ? "bg-destructive/15 text-destructive"
        : status === "cancelled"
          ? "bg-destructive/15 text-destructive"
          : status === "pending_payment"
            ? "bg-amber-500/15 text-amber-500"
            : status === "in_progress"
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-primary/15 text-primary"
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tone)}>
      {STATUS_LABEL[status] ?? status}
      {paymentStatus === "paid" ? " · Paid" : ""}
    </span>
  )
}

export function AppointmentsHub({
  appointments,
  bookableTypes,
  activeHandle,
  activeHomeName,
  hostMode = false,
  publishableKey,
}: {
  appointments: MyAppointmentRow[]
  bookableTypes: AppointmentTypeRow[]
  activeHandle: string | null
  activeHomeName: string | null
  hostMode?: boolean
  publishableKey: string
}) {
  const router = useRouter()
  const [view, setView] = useState<"list" | "book">("list")

  // Hosts never book — the page is their console of sessions booked with them.
  const canBook = !hostMode && bookableTypes.length > 0

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">Appointments</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {hostMode
              ? "Sessions booked with you — each has its own conversation and meeting."
              : "Private sessions — each opens its own conversation and meeting."}
          </p>
        </div>
        {view === "list" && canBook && (
          <button
            type="button"
            onClick={() => setView("book")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-95"
          >
            <Plus className="size-4" />
            Book
          </button>
        )}
      </header>

      <div className="mt-6">
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
/* My appointments                                                            */
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
  if (appointments.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 px-6 py-14 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
          <CalendarClock className="size-6 text-primary" />
        </div>
        <h2 className="mt-4 font-medium">No appointments yet</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {hostMode
            ? "When a member books a session with you, it will appear here with its own conversation."
            : canBook
              ? `Book a session${activeHomeName ? ` with ${activeHomeName}` : ""} and it will appear here with its own conversation.`
              : "When a session is available to book, it will show up here."}
        </p>
        {canBook && (
          <button
            type="button"
            onClick={onBook}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-95"
          >
            <Plus className="size-4" />
            Book an appointment
          </button>
        )}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {appointments.map((a) => (
        <li
          key={a.id}
          className="rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-border"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium">{a.title}</h3>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {a.homeName}
                {a.hostName ? ` · ${a.hostName}` : ""}
              </p>
            </div>
            <StatusChip status={a.status} paymentStatus={a.paymentStatus} />
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="size-4 shrink-0 text-primary/70" />
              <span className="text-foreground">{formatWhen(a.startsAt)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-4 shrink-0 text-primary/70" />
              {a.durationMinutes} min
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {a.useFrequencyLive ? (
                <>
                  <Video className="size-4 shrink-0 text-primary/70" />
                  Frequency Live
                </>
              ) : (
                <>
                  <MapPin className="size-4 shrink-0 text-primary/70" />
                  <span className="truncate">{a.location ?? "In person"}</span>
                </>
              )}
            </div>
          </dl>

          {a.status !== "cancelled" && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {a.conversationId ? (
                <Link
                  href={`/messages/${a.conversationId}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
                >
                  <MessageSquare className="size-3.5" />
                  Open Conversation
                </Link>
              ) : a.status === "pending_payment" ? (
                <span className="text-xs text-muted-foreground">Complete payment to open your conversation.</span>
              ) : null}
              {a.useFrequencyLive &&
                a.status !== "completed" &&
                a.status !== "no_show" &&
                a.paymentStatus !== "pending" && <JoinMeetingButton appointmentId={a.id} size="sm" />}
            </div>
          )}
        </li>
      ))}
    </ul>
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
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Paid flow: the Stripe client secret + the appointment awaiting reconcile.
  const [checkout, setCheckout] = useState<{ clientSecret: string; appointmentId: string } | null>(null)
  const [confirming, setConfirming] = useState(false)

  const chooseType = (type: AppointmentTypeRow) => {
    setSelectedType(type)
    setSelectedSlot(null)
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

  // Group slots by day for a compact picker.
  const slotsByDay = useMemo(() => {
    const map = new Map<string, OpenSlot[]>()
    for (const s of slots ?? []) {
      const key = new Date(s.startISO).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [slots])

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
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Choose a session{activeHomeName ? ` with ${activeHomeName}` : ""}.
          </p>
          <ul className="flex flex-col gap-3">
            {bookableTypes.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => chooseType(t)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 text-left transition-all hover:border-primary/50 hover:bg-card active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <h3 className="font-medium">{t.title}</h3>
                    {t.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {t.durationMinutes} min
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {t.useFrequencyLive ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}
                        {t.useFrequencyLive ? "Frequency Live" : t.location ?? "In person"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-sm font-semibold",
                      t.priceCents == null ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
                    )}
                  >
                    {formatMoney(t.priceCents, t.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-4">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{selectedType.title}</h3>
              <span
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-sm font-semibold",
                  selectedType.priceCents == null ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
                )}
              >
                {formatMoney(selectedType.priceCents, selectedType.currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedType.durationMinutes} min · {selectedType.useFrequencyLive ? "Frequency Live" : "In person"}
            </p>
          </div>

          <h4 className="mb-2 mt-5 text-sm font-semibold">Pick a time</h4>
          {loadingSlots ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Finding open times…
            </div>
          ) : slotsByDay.length === 0 ? (
            <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
              No open times in the next few weeks. Please check back soon.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {slotsByDay.map(([day, daySlots]) => (
                <div key={day}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => {
                      const active = selectedSlot === s.startISO
                      return (
                        <button
                          key={s.startISO}
                          type="button"
                          onClick={() => setSelectedSlot(s.startISO)}
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-sm font-medium tabular-nums transition-all active:scale-95",
                            active
                              ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                              : "border-border bg-background hover:border-primary/50",
                          )}
                        >
                          {new Date(s.startISO).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedSlot && (
            <div className="sticky bottom-4 mt-6">
              <button
                type="button"
                onClick={confirmBooking}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/30 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
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
                    : `Pay ${formatMoney(selectedType.priceCents, selectedType.currency)} & book`}
              </button>
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
