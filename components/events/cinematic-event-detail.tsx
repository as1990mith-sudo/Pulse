"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Heart,
  MapPin,
  Navigation,
  Share2,
  Ticket,
} from "lucide-react"
import { homeAccentStyle } from "@/lib/home/accent"
import { Countdown } from "@/components/event-showcase/countdown"

type Mode = "open" | "full" | "closed" | "members" | "registered"

type Props = {
  backHref: string
  title: string
  homeName: string
  homeHandle: string
  orgLogo: string | null
  accentColor: string | null
  flyer: string | null
  description: string | null
  dateLabel: string | null
  timeLabel: string | null
  location: string | null
  /** Future event start as ISO; null when past or undated (no countdown). */
  startISO: string | null
  /** e.g. "42 of 100 places left" — null for unlimited/unknown. */
  capacityNote: string | null
  mode: Mode
  signInHref: string
  /** The real, working registration surface (RegistrationPanel). */
  children: React.ReactNode
}

/**
 * The cinematic visual shell for a single public event.
 *
 * Purely presentational: every decision that matters (who the viewer is, whether
 * registration is open, capacity) is resolved on the server and passed in. The
 * actual registration still happens through the real RegistrationPanel handed in
 * as `children`, so this redesign never forks the working submit flow.
 */
export function CinematicEventDetail({
  backHref,
  title,
  homeName,
  homeHandle,
  orgLogo,
  accentColor,
  flyer,
  description,
  dateLabel,
  timeLabel,
  location,
  startISO,
  capacityNote,
  mode,
  signInHref,
  children,
}: Props) {
  const [favorited, setFavorited] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [showBar, setShowBar] = useState(true)
  const registerRef = useRef<HTMLDivElement | null>(null)

  // Hide the sticky bar while the registration section itself is on screen — it
  // would only duplicate the panel the viewer is already looking at.
  useEffect(() => {
    const el = registerRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const scrollToRegister = useCallback(() => {
    registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const share = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} · ${homeName}`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShareNote("Link copied")
      setTimeout(() => setShareNote(null), 1800)
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }, [title, homeName])

  const accentText = { color: "var(--home-accent)" }

  return (
    <div
      className="relative min-h-dvh overflow-x-clip bg-[#050505] text-white"
      style={{ ...homeAccentStyle({ accentColor }), fontFamily: "var(--font-geist-sans)" }}
    >
      {/* ---- HERO ---- */}
      <header className="relative">
        <div className="relative h-[clamp(440px,72vh,620px)] w-full overflow-hidden">
          {flyer ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={flyer || "/placeholder.svg"}
              alt=""
              className="absolute inset-0 size-full object-cover object-[center_25%]"
            />
          ) : (
            <div className="absolute inset-0 bg-[#0B0B0B]" />
          )}

          {/* atmospheric accent glow behind the subject */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-[-10%] top-[12%] h-72 w-72 rounded-full blur-[90px]"
            style={{ backgroundColor: "var(--home-accent)", opacity: 0.28 }}
          />
          {/* cinematic gradients: left-to-right, bottom fade into the page, vignette */}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#050505]/85 via-[#050505]/25 to-transparent" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/35 to-transparent" />
          <div aria-hidden className="absolute inset-0 shadow-[inset_0_0_140px_40px_rgba(5,5,5,0.7)]" />

          {/* overlay nav */}
          <nav
            className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4"
            style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}
            aria-label="Event"
          >
            <Link
              href={backHref}
              aria-label="Back to all events"
              className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/40 backdrop-blur-md transition-transform active:scale-95"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={share}
                aria-label="Share this event"
                className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/40 backdrop-blur-md transition-transform active:scale-95"
              >
                <Share2 className="size-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setFavorited((v) => !v)}
                aria-label={favorited ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={favorited}
                className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/40 backdrop-blur-md transition-transform active:scale-95"
              >
                <Heart className="size-[18px]" style={favorited ? accentText : undefined} fill={favorited ? "currentColor" : "none"} />
              </button>
            </div>
          </nav>
          {shareNote ? (
            <div className="absolute inset-x-0 top-16 z-20 flex justify-center">
              <span className="rounded-full border border-white/10 bg-black/70 px-3 py-1 text-xs backdrop-blur-md">
                {shareNote}
              </span>
            </div>
          ) : null}

          {/* hero content, lower-left */}
          <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-7">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ borderColor: "color-mix(in srgb, var(--home-accent) 45%, transparent)", color: "var(--home-accent)" }}
            >
              <Ticket className="size-3.5" />
              Free event
            </span>
            <h1
              className="mt-3 max-w-[15ch] text-balance text-[clamp(38px,11vw,56px)] font-semibold leading-[0.98] tracking-[-0.01em]"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-[46ch] text-pretty text-[15px] leading-relaxed text-white/70 line-clamp-2">
                {description}
              </p>
            ) : null}
            <div className="mt-4 inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 backdrop-blur-md">
              {orgLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={orgLogo || "/placeholder.svg"} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span
                  className="grid size-8 place-items-center rounded-full text-xs font-bold text-black"
                  style={{ backgroundColor: "var(--home-accent)" }}
                >
                  {homeName.slice(0, 1)}
                </span>
              )}
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] uppercase tracking-[0.14em] text-white/50">Hosted by</span>
                <span className="flex items-center gap-1 text-sm font-semibold">
                  {homeName}
                  <Check className="size-3.5" style={accentText} />
                </span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-lg flex-col gap-8 pb-40 pt-6 lg:max-w-2xl">
        {/* ---- META CARD ---- */}
        <section className="px-5">
          <div className="flex flex-wrap gap-px overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.02]">
            <MetaCell icon={<CalendarDays className="size-4" />} label="Date" value={dateLabel ?? "TBC"} />
            <MetaCell icon={<Clock className="size-4" />} label="Time" value={timeLabel ?? "TBC"} />
            {location ? <MetaCell icon={<MapPin className="size-4" />} label="Location" value={location} wide /> : null}
          </div>
          {capacityNote ? (
            <p className="mt-3 text-center text-[13px] text-white/55">{capacityNote}</p>
          ) : null}
        </section>

        {/* ---- TOP CTA (only when actionable) ---- */}
        {mode === "open" ? (
          <section className="px-5">
            <button
              type="button"
              onClick={scrollToRegister}
              className="group flex h-[58px] w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-semibold text-black transition-all active:scale-[0.98]"
              style={{
                background: "linear-gradient(180deg, color-mix(in srgb, var(--home-accent) 92%, white), var(--home-accent))",
                boxShadow: "0 10px 34px -8px color-mix(in srgb, var(--home-accent) 60%, transparent)",
              }}
            >
              Register for this event
              <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" />
            </button>
            <div className="mt-3 flex items-center justify-center gap-4 text-[12px] text-white/55">
              {["Open to all", "Free event", "Secure registration"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5" style={accentText} />
                  {t}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* ---- COUNTDOWN (future events only) ---- */}
        {startISO ? <Countdown targetISO={startISO} /> : null}

        {/* ---- ABOUT ---- */}
        {description ? (
          <section className="px-5">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.24em] text-white/45">About this event</h2>
            <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-white/80">
              {description.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="text-pretty">
                  {para}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {/* ---- REGISTRATION (real panel) ---- */}
        <section ref={registerRef} id="register" className="scroll-mt-6 px-5">
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.24em] text-white/45">Reserve your place</h2>
          {children}
        </section>

        {/* ---- LOCATION ---- */}
        {location ? (
          <section className="px-5">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.24em] text-white/45">Location</h2>
            <div className="mt-3 overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.02]">
              <div
                aria-hidden
                className="relative h-28 w-full"
                style={{
                  backgroundColor: "#0C0C0C",
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                  backgroundSize: "26px 26px",
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-black"
                  style={{ backgroundColor: "var(--home-accent)" }}
                >
                  <MapPin className="size-5" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <p className="text-[14px] leading-snug text-white/80">{location}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold"
                  style={accentText}
                >
                  <Navigation className="size-3.5" />
                  Directions
                </a>
              </div>
            </div>
          </section>
        ) : null}

        <p className="px-5 text-center text-xs text-white/35">
          Hosted on Frequency by{" "}
          <Link href={`/org/${homeHandle}`} className="underline underline-offset-2">
            {homeName}
          </Link>
        </p>
      </div>

      {/* ---- STICKY REGISTER BAR ---- */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 transition-all duration-300 ${
          showBar ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div
          className="border-t border-white/10 bg-black/70 backdrop-blur-xl"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
        >
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-5 pt-3 lg:max-w-2xl">
            <StickyLeft mode={mode} />
            <StickyAction mode={mode} signInHref={signInHref} onScroll={scrollToRegister} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaCell({
  icon,
  label,
  value,
  wide,
}: {
  icon: React.ReactNode
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <div className={`flex min-w-[45%] flex-1 flex-col gap-1.5 bg-[#0A0A0A] p-4 ${wide ? "basis-full" : ""}`}>
      <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-white/45">
        <span style={{ color: "var(--home-accent)" }}>{icon}</span>
        {label}
      </span>
      <span className="text-[15px] font-medium leading-snug text-white/90">{value}</span>
    </div>
  )
}

function StickyLeft({ mode }: { mode: Mode }) {
  if (mode === "registered") {
    return (
      <span className="flex flex-col leading-tight">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--home-accent)" }}>
          <Check className="size-4" />
          You&apos;re going
        </span>
        <span className="text-[12px] text-white/50">Place confirmed</span>
      </span>
    )
  }
  const label =
    mode === "full" ? "Fully booked" : mode === "closed" ? "Registration closed" : mode === "members" ? "Members only" : "Free event"
  const sub =
    mode === "full"
      ? "No places left"
      : mode === "closed"
        ? "This event has ended"
        : mode === "members"
          ? "Open to Home members"
          : "No registration fee"
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-[13px] font-semibold text-white">{label}</span>
      <span className="text-[12px] text-white/50">{sub}</span>
    </span>
  )
}

function StickyAction({
  mode,
  signInHref,
  onScroll,
}: {
  mode: Mode
  signInHref: string
  onScroll: () => void
}) {
  if (mode === "members") {
    return (
      <Link
        href={signInHref}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[14px] font-semibold text-black transition-transform active:scale-95"
        style={{ backgroundColor: "var(--home-accent)" }}
      >
        Sign in
      </Link>
    )
  }
  const label = mode === "open" ? "Register" : "View details"
  return (
    <button
      type="button"
      onClick={onScroll}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[14px] font-semibold text-black transition-all active:scale-95"
      style={{
        background: "linear-gradient(180deg, color-mix(in srgb, var(--home-accent) 92%, white), var(--home-accent))",
        boxShadow: "0 8px 26px -8px color-mix(in srgb, var(--home-accent) 60%, transparent)",
      }}
    >
      {label}
      <ArrowRight className="size-[18px]" />
    </button>
  )
}
