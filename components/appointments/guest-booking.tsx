"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
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
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AppointmentCheckout } from "@/components/appointments/appointment-checkout"
import {
  bookGuestAppointment,
  confirmGuestAppointmentPaid,
  getPublicOpenSlots,
  type PublicBookingHome,
} from "@/app/actions/public-appointments"
import type { OpenSlot, PublicTypeRow } from "@/lib/appointments/core"

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

function formatMoney(cents: number | null, currency: string) {
  if (cents == null || cents === 0) return "Free"
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
/* Root                                                                       */
/* -------------------------------------------------------------------------- */

type Step = "type" | "slot" | "details" | "pay" | "done"

export function GuestBooking({
  home,
  types,
  publishableKey,
}: {
  home: PublicBookingHome
  types: PublicTypeRow[]
  publishableKey: string
}) {
  const [step, setStep] = useState<Step>("type")
  const [type, setType] = useState<PublicTypeRow | null>(null)
  const [slotISO, setSlotISO] = useState<string | null>(null)
  const [manageToken, setManageToken] = useState<string | null>(null)

  const goType = () => {
    setStep("type")
    setType(null)
    setSlotISO(null)
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <BrandHeader home={home} />

      <div className="mt-6">
        {step === "done" && manageToken ? (
          <SuccessCard home={home} type={type} slotISO={slotISO} manageToken={manageToken} />
        ) : types.length === 0 ? (
          <EmptyState />
        ) : step === "type" ? (
          <TypeList types={types} onChoose={(t) => { setType(t); setStep("slot") }} />
        ) : type && step === "slot" ? (
          <SlotPicker
            home={home}
            type={type}
            selected={slotISO}
            onSelect={setSlotISO}
            onBack={goType}
            onContinue={() => setStep("details")}
          />
        ) : type && slotISO && (step === "details" || step === "pay") ? (
          <DetailsAndPay
            home={home}
            type={type}
            slotISO={slotISO}
            publishableKey={publishableKey}
            onBack={() => setStep("slot")}
            onDone={(token) => { setManageToken(token); setStep("done") }}
          />
        ) : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Brand header                                                               */
/* -------------------------------------------------------------------------- */

function BrandHeader({ home }: { home: PublicBookingHome }) {
  return (
    <header className="relative overflow-hidden rounded-[28px] border border-border/60 p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 85% -10%, color-mix(in oklch, var(--primary) 34%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in oklch, var(--card) 92%, transparent), color-mix(in oklch, var(--background) 96%, transparent))",
        }}
      />
      <div className="relative flex items-center gap-4">
        {home.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={home.avatarUrl || "/placeholder.svg"}
            alt={`${home.name} logo`}
            className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-inset ring-white/15"
          />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-inset ring-primary/25">
            <CalendarClock className="size-6" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/90">Book with</p>
          <h1 className="truncate font-display text-2xl font-semibold leading-tight tracking-tight text-balance">
            {home.name}
          </h1>
        </div>
      </div>
      {home.tagline && (
        <p className="relative mt-3 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
          {home.tagline}
        </p>
      )}
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Type list                                                                  */
/* -------------------------------------------------------------------------- */

function TypeList({ types, onChoose }: { types: PublicTypeRow[]; onChoose: (t: PublicTypeRow) => void }) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <p className="mb-3 text-sm text-muted-foreground">Choose a session to book.</p>
      <ul className="flex flex-col gap-2.5">
        {types.map((t) => {
          const Icon = typeIcon(t.title)
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onChoose(t)}
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
                      {t.useFrequencyLive ? "Video call" : t.location ?? "In person"}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                    t.priceCents == null || t.priceCents === 0
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/15 text-primary",
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
  )
}

/* -------------------------------------------------------------------------- */
/* Slot picker                                                                */
/* -------------------------------------------------------------------------- */

function SlotPicker({
  home,
  type,
  selected,
  onSelect,
  onBack,
  onContinue,
}: {
  home: PublicBookingHome
  type: PublicTypeRow
  selected: string | null
  onSelect: (iso: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setSlots(null)
    setError(null)
    getPublicOpenSlots(home.handle, type.id)
      .then((s) => alive && setSlots(s))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load times."))
    return () => {
      alive = false
    }
  }, [home.handle, type.id])

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
  const Icon = typeIcon(type.title)

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All sessions
      </button>

      <div className="mt-4 flex items-center gap-3.5 rounded-2xl border border-border/60 bg-card/40 p-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{type.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {type.durationMinutes} min · {type.useFrequencyLive ? "Video call" : type.location ?? "In person"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            type.priceCents == null || type.priceCents === 0
              ? "bg-muted text-muted-foreground"
              : "bg-primary/15 text-primary",
          )}
        >
          {formatMoney(type.priceCents, type.currency)}
        </span>
      </div>

      {slots === null && !error ? (
        <SlotSkeleton />
      ) : error ? (
        <p className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
          {error}
        </p>
      ) : days.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
          No open times in the next few weeks. Please check back soon.
        </p>
      ) : (
        <>
          <StepHeading n={1}>Choose a date</StepHeading>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {days.map((d) => {
              const active = d.key === dayKey
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => {
                    setDayKey(d.key)
                    onSelect("")
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
                  <span
                    className={cn("text-[11px]", active ? "text-primary-foreground/80" : "text-muted-foreground")}
                  >
                    {d.date.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                </button>
              )
            })}
          </div>

          <StepHeading n={2}>Choose a time</StepHeading>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {activeDay?.slots.map((s) => {
              const active = selected === s.startISO
              return (
                <button
                  key={s.startISO}
                  type="button"
                  onClick={() => onSelect(s.startISO)}
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

      {selected && (
        <div className="sticky bottom-4 z-10 mt-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
          <div className="rounded-2xl border border-border bg-popover/95 p-3 shadow-floating backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <CalendarClock className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Your selection
                  </p>
                  <p className="truncate text-sm font-semibold">
                    {formatFullDate(selected)} · {formatTime(selected)}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-primary">
                {formatMoney(type.priceCents, type.currency)}
              </span>
            </div>
            <button
              type="button"
              onClick={onContinue}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Continue
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Details + payment                                                          */
/* -------------------------------------------------------------------------- */

function DetailsAndPay({
  home,
  type,
  slotISO,
  publishableKey,
  onBack,
  onDone,
}: {
  home: PublicBookingHome
  type: PublicTypeRow
  slotISO: string
  publishableKey: string
  onBack: () => void
  onDone: (manageToken: string) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [checkout, setCheckout] = useState<{ appointmentId: string; manageToken: string; clientSecret: string } | null>(
    null,
  )
  const [confirming, setConfirming] = useState(false)

  const isPaid = type.priceCents != null && type.priceCents > 0

  const submit = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await bookGuestAppointment({
          handle: home.handle,
          typeId: type.id,
          slotStartISO: slotISO,
          guestName: name,
          guestEmail: email,
          guestPhone: phone,
        })
        if (res.kind === "confirmed") {
          onDone(res.manageToken)
        } else {
          setCheckout({ appointmentId: res.appointmentId, manageToken: res.manageToken, clientSecret: res.clientSecret })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not book that time.")
      }
    })
  }

  const onPaymentComplete = () => {
    if (!checkout) return
    setConfirming(true)
    confirmGuestAppointmentPaid(checkout.appointmentId)
      .then(() => onDone(checkout.manageToken))
      .catch((e) => setError(e instanceof Error ? e.message : "Payment could not be confirmed."))
      .finally(() => setConfirming(false))
  }

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Change time
      </button>

      <div className="mt-4 rounded-2xl border border-border/60 bg-card/40 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{type.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatFullDate(slotISO)} · {formatTime(slotISO)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Field label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Jane Doe"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </Field>
        <Field label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="jane@example.com"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </Field>
        <Field label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            autoComplete="tel"
            placeholder="+1 555 000 1234"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </Field>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isPaid ? (
          <CreditCard className="size-4" />
        ) : (
          <Check className="size-4" />
        )}
        {isPending
          ? "Booking…"
          : isPaid
            ? `Continue to pay ${formatMoney(type.priceCents, type.currency)}`
            : "Confirm booking"}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="size-3" />
        {isPaid ? "Secure booking · confirmation emailed after payment." : "A confirmation is emailed to you."}
      </p>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* Success                                                                    */
/* -------------------------------------------------------------------------- */

function SuccessCard({
  home,
  type,
  slotISO,
  manageToken,
}: {
  home: PublicBookingHome
  type: PublicTypeRow | null
  slotISO: string | null
  manageToken: string
}) {
  return (
    <div className="animate-in fade-in-0 zoom-in-95 duration-300 rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-500">
        <CheckCircle2 className="size-7" />
      </div>
      <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">You&apos;re booked</h2>
      {type && slotISO && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
          {type.title} with {home.name} on {formatFullDate(slotISO)} at {formatTime(slotISO)}. A confirmation is on its
          way to your inbox.
        </p>
      )}
      <Link
        href={`/appointment/${encodeURIComponent(manageToken)}`}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98]"
      >
        Manage your appointment
        <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Bits                                                                       */
/* -------------------------------------------------------------------------- */

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/30 px-6 py-14 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary/10">
        <CalendarClock className="size-5 text-primary" />
      </div>
      <h2 className="mt-3 font-medium">No sessions available</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">
        This Home has no open appointment types right now. Please check back soon.
      </p>
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
