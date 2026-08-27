"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, Check, CalendarPlus, Eye, X, Loader2 } from "lucide-react"

type Props = {
  open: boolean
  onClose: () => void
  eventName: string
  organizer: string
  startISO: string
  endISO: string
  location: string
}

type Errors = Partial<Record<"name" | "email" | "phone", string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toICSDate(iso: string) {
  // 2026-08-28T00:00 -> 20260828T000000
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
}

/**
 * Premium registration bottom sheet. Self-contained (showcase only): validates
 * client-side, fakes a short submit, then swaps to a success state offering an
 * .ics download and a "view event" close. Locks body scroll while open and
 * restores focus target on close.
 */
export function RegistrationModal({ open, onClose, eventName, organizer, startISO, endISO, location }: Props) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [attendees, setAttendees] = useState(1)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
      // let the sheet paint before focusing so the entrance transition runs
      const id = setTimeout(() => firstFieldRef.current?.focus(), 250)
      return () => {
        document.body.style.overflow = ""
        clearTimeout(id)
      }
    }
  }, [open])

  // Reset back to the form the next time it opens after a completed run.
  useEffect(() => {
    if (open && done) {
      // keep success visible on this open; reset happens on close below
    }
  }, [open, done])

  function handleClose() {
    onClose()
    // clear after the close animation so the user doesn't see it flip
    setTimeout(() => {
      setDone(false)
      setSubmitting(false)
      setName("")
      setEmail("")
      setPhone("")
      setAttendees(1)
      setErrors({})
    }, 300)
  }

  function validate(): boolean {
    const next: Errors = {}
    if (name.trim().length < 2) next.name = "Please enter your full name"
    if (!EMAIL_RE.test(email)) next.email = "Enter a valid email address"
    if (phone.replace(/[^\d]/g, "").length < 7) next.phone = "Enter a valid phone number"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      setDone(true)
    }, 1100)
  }

  function downloadICS() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Frequency//Event//EN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@frequency`,
      `DTSTAMP:${toICSDate(new Date().toISOString())}`,
      `DTSTART:${toICSDate(startISO)}`,
      `DTEND:${toICSDate(endISO)}`,
      `SUMMARY:${eventName}`,
      `DESCRIPTION:Hosted by ${organizer}`,
      `LOCATION:${location.replace(/,/g, "\\,")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "night-of-rescue.ics"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className={`fixed inset-0 z-[60] transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
    >
      {/* scrim */}
      <button
        type="button"
        aria-label="Close registration"
        onClick={handleClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Register for ${eventName}`}
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[26px] border border-white/[0.08] bg-[#0A0A0A] pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-[#FF7A1A]/25 blur-[70px]"
        />

        <div className="relative flex items-center justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-white/15" />
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-4 top-3 flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#A1A1AA] transition-colors hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {!done ? (
          <form onSubmit={handleSubmit} className="relative px-6 pb-8 pt-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#FF9D4D]">Register for</p>
            <h2 className="mt-1 font-serif text-3xl font-semibold text-white" style={{ fontFamily: "var(--font-playfair)" }}>
              {eventName}
            </h2>

            <div className="mt-6 space-y-4">
              <Field
                label="Full name"
                inputRef={firstFieldRef}
                value={name}
                onChange={setName}
                placeholder="Your name"
                error={errors.name}
                autoComplete="name"
              />
              <Field
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@email.com"
                error={errors.email}
                autoComplete="email"
              />
              <Field
                label="Phone number"
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="+44 …"
                error={errors.phone}
                autoComplete="tel"
              />

              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#71717A]">
                  Number of attendees <span className="lowercase tracking-normal text-[#5B554F]">(optional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <Stepper label="Decrease attendees" onClick={() => setAttendees((n) => Math.max(1, n - 1))}>
                    −
                  </Stepper>
                  <span className="min-w-8 text-center text-lg font-semibold tabular-nums text-white">{attendees}</span>
                  <Stepper label="Increase attendees" onClick={() => setAttendees((n) => Math.min(10, n + 1))}>
                    +
                  </Stepper>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="group mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-[#FF6A00] to-[#FF9D4D] text-[15px] font-semibold text-black shadow-[0_10px_40px_-8px_rgba(255,122,26,0.6)] transition-transform active:scale-[0.98] disabled:opacity-80"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Reserving your place…
                </>
              ) : (
                <>
                  Complete registration
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[12px] text-[#71717A]">Free event · No payment required</p>
          </form>
        ) : (
          <div className="relative flex flex-col items-center px-6 pb-9 pt-6 text-center">
            <div className="relative flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6A00] to-[#FF9D4D] shadow-[0_0_50px_-6px_rgba(255,122,26,0.8)]">
              <Check className="size-8 text-black" strokeWidth={3} />
            </div>
            <h2 className="mt-5 font-serif text-3xl font-semibold text-white" style={{ fontFamily: "var(--font-playfair)" }}>
              {"You're registered!"}
            </h2>
            <p className="mt-2 max-w-[300px] text-[15px] leading-relaxed text-[#A1A1AA]">
              Your place at <span className="text-white">{eventName}</span> has been reserved. A confirmation is on its
              way to your inbox.
            </p>

            <div className="mt-7 flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={downloadICS}
                className="flex h-[52px] items-center justify-center gap-2 rounded-[16px] border border-white/10 bg-white/[0.04] py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.07]"
              >
                <CalendarPlus className="size-4 text-[#FF9D4D]" /> Add to calendar
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex items-center justify-center gap-2 rounded-[16px] py-3 text-[15px] font-medium text-[#A1A1AA] transition-colors hover:text-white"
              >
                <Eye className="size-4" /> View event
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = "text",
  autoComplete,
  inputRef,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  type?: string
  autoComplete?: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#71717A]">{label}</label>
      <input
        ref={inputRef}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={`h-[52px] w-full rounded-[14px] border bg-white/[0.03] px-4 py-3.5 text-[15px] text-white placeholder:text-[#5B554F] outline-none transition-colors focus:border-[#FF7A1A]/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-[#FF7A1A]/20 ${
          error ? "border-[#FF5D5D]/60" : "border-white/[0.08]"
        }`}
      />
      {error ? <p className="mt-1.5 text-[12px] text-[#FF7D7D]">{error}</p> : null}
    </div>
  )
}

function Stepper({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl text-white transition-colors hover:bg-white/[0.08] active:scale-95"
    >
      {children}
    </button>
  )
}
