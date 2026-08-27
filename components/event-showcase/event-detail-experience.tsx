"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import {
  ChevronLeft,
  Share2,
  Heart,
  MoreHorizontal,
  Calendar,
  Clock,
  MapPin,
  ArrowRight,
  Play,
  Music,
  HandHeart,
  Sparkles,
  Heart as HeartLine,
  MessageSquareQuote,
  Navigation,
  ChevronDown,
  Check,
  BadgeCheck,
} from "lucide-react"
import { Countdown } from "./countdown"
import { RegistrationModal } from "./registration-modal"

const EVENT = {
  name: "Night of Rescue",
  organizer: "Prayer Palace International",
  pill: "Special Service",
  tagline: "A night of divine intervention, breakthrough and supernatural rescue.",
  startISO: "2026-08-28T00:00:00",
  endISO: "2026-08-28T03:00:00",
  dateLabel: "Fri, 28 Aug 2026",
  doorsLabel: "Doors open at 23:30",
  timeLabel: "00:00",
  timeSub: "Until late",
  addressLine1: "16 John Wilson Street",
  addressLine2: "SE18 6QQ, London, UK",
  hero: "/showcase/night-of-rescue-hero.png",
  video: "/showcase/previous-night-worship.png",
}

export function EventDetailExperience() {
  const [fav, setFav] = useState(false)
  const [shared, setShared] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const heroCtaRef = useRef<HTMLDivElement>(null)

  // Sticky bar appears once the hero's primary CTA has scrolled out of view, so
  // there's always exactly one visible Register action — never two at once.
  useEffect(() => {
    const el = heroCtaRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setShowSticky(!entry.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (navigator.share) {
        await navigator.share({ title: EVENT.name, text: EVENT.tagline, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 1800)
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  }

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#050505] text-white">
      <div className="mx-auto w-full max-w-[460px] lg:max-w-[1200px]">
        {/* ============ HERO ============ */}
        <section className="relative">
          <div className="relative h-[560px] w-full overflow-hidden lg:h-[620px] lg:rounded-b-[32px]">
            <Image
              src={EVENT.hero || "/placeholder.svg"}
              alt="Pastor hosting Night of Rescue"
              fill
              priority
              sizes="(min-width: 1024px) 1200px, 100vw"
              className="object-cover object-top"
            />
            {/* amber atmospheric glow behind subject */}
            <div
              aria-hidden
              className="pointer-events-none absolute right-[-10%] top-[18%] h-80 w-80 rounded-full bg-[#FF7A1A]/25 blur-[90px]"
            />
            {/* left + bottom cinematic scrims blending into the page */}
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/10 to-transparent" />
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/30 to-black/30" />
            <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_40px_rgba(0,0,0,0.6)]" />

            {/* overlay nav */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)]">
              <GlassBtn label="Go back" onClick={() => window.history.back()}>
                <ChevronLeft className="size-5" />
              </GlassBtn>
              <div className="flex items-center gap-2.5">
                <GlassBtn label={shared ? "Link copied" : "Share event"} onClick={handleShare}>
                  {shared ? <Check className="size-[18px] text-[#FF9D4D]" /> : <Share2 className="size-[18px]" />}
                </GlassBtn>
                <GlassBtn label={fav ? "Remove from favourites" : "Add to favourites"} onClick={() => setFav((v) => !v)}>
                  <Heart className={`size-[18px] transition-colors ${fav ? "fill-[#FF6A00] text-[#FF6A00]" : ""}`} />
                </GlassBtn>
                <GlassBtn label="More options">
                  <MoreHorizontal className="size-[18px]" />
                </GlassBtn>
              </div>
            </div>

            {/* hero content — lower left */}
            <div className="absolute inset-x-0 bottom-0 px-5 pb-7 lg:px-10 lg:pb-12">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF7A1A]/40 bg-[#FF7A1A]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[#FF9D4D] backdrop-blur">
                <span className="size-1.5 rounded-full bg-[#FF6A00]" />
                {EVENT.pill}
              </span>

              <h1
                className="mt-4 font-serif text-[52px] font-semibold leading-[0.95] tracking-tight text-white lg:text-[80px]"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Night of
                <br />
                <span className="bg-gradient-to-r from-[#FF6A00] to-[#FFB066] bg-clip-text text-transparent">RESCUE</span>
              </h1>

              <p className="mt-3 max-w-[340px] text-[15px] leading-relaxed text-[#C9C4BE] text-pretty">{EVENT.tagline}</p>

              <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-3.5 py-2.5 backdrop-blur-md">
                <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6A00] to-[#FF9D4D] text-sm font-bold text-black">
                  P
                </span>
                <span className="leading-tight">
                  <span className="block text-[11px] uppercase tracking-[0.14em] text-[#9C948C]">With Pastor</span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-white">
                    {EVENT.organizer}
                    <BadgeCheck className="size-4 text-[#FF9D4D]" />
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:px-10">
          <div>
            {/* ============ META CARD ============ */}
            <section className="px-5 pt-6 lg:px-0">
              <div className="grid grid-cols-2 gap-3 rounded-[22px] border border-white/[0.07] bg-[#0B0B0B]/80 p-5 backdrop-blur sm:grid-cols-3">
                <Meta icon={<Calendar className="size-4 text-[#FF9D4D]" />} label="Date" a={EVENT.dateLabel} b={EVENT.doorsLabel} />
                <Meta icon={<Clock className="size-4 text-[#FF9D4D]" />} label="Time" a={EVENT.timeLabel} b={EVENT.timeSub} />
                <Meta
                  icon={<MapPin className="size-4 text-[#FF9D4D]" />}
                  label="Location"
                  a={EVENT.addressLine1}
                  b={EVENT.addressLine2}
                  className="col-span-2 sm:col-span-1"
                />
              </div>
            </section>

            {/* ============ PRIMARY CTA ============ */}
            <section className="px-5 pt-5 lg:px-0" ref={heroCtaRef}>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="group flex h-[60px] w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-[#FF6A00] to-[#FF9D4D] text-[16px] font-semibold text-black shadow-[0_14px_50px_-10px_rgba(255,122,26,0.65)] transition-all duration-200 hover:shadow-[0_16px_60px_-8px_rgba(255,122,26,0.85)] active:scale-[0.98]"
              >
                Register for this event
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </button>
              <div className="mt-3.5 flex items-center justify-center gap-4">
                {["Open to all", "Free event", "Secure registration"].map((r) => (
                  <span key={r} className="flex items-center gap-1.5 text-[12px] text-[#9C948C]">
                    <Check className="size-3.5 text-[#FF9D4D]" />
                    {r}
                  </span>
                ))}
              </div>
            </section>

            {/* ============ COUNTDOWN ============ */}
            <div className="pt-7 lg:px-0">
              <Countdown targetISO={EVENT.startISO} />
            </div>

            {/* ============ PREVIOUS VIDEO ============ */}
            <section className="px-5 pt-7 lg:px-0">
              <button
                type="button"
                className="group relative block w-full overflow-hidden rounded-[22px] border border-white/[0.07] text-left"
              >
                <div className="relative h-56 w-full">
                  <Image src={EVENT.video || "/placeholder.svg"} alt="Previous Night of Rescue worship" fill sizes="460px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />
                </div>
                <div className="absolute inset-0 flex flex-col justify-between p-5">
                  <span className="self-start rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white backdrop-blur">
                    12:47
                  </span>
                  <div className="flex items-end justify-between">
                    <h3 className="font-serif text-2xl font-semibold leading-tight text-white" style={{ fontFamily: "var(--font-playfair)" }}>
                      Watch Previous
                      <br />
                      Night of Rescue
                    </h3>
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-all group-hover:scale-105 group-hover:bg-[#FF6A00]">
                      <Play className="size-6 translate-x-0.5 fill-white text-white" />
                    </span>
                  </div>
                </div>
              </button>
            </section>

            {/* ============ ABOUT ============ */}
            <section className="px-5 pt-9 lg:px-0">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#71717A]">About this event</h2>
              <p className="mt-4 text-[16px] leading-[1.7] text-[#C9C4BE] text-pretty">
                Join us for a powerful night of prayer, worship and the manifest presence of God. Expect healing,
                deliverance, breakthroughs and testimonies that will change your story forever.
              </p>

              <blockquote className="mt-6 rounded-r-2xl border-l-2 border-[#FF6A00] bg-white/[0.02] py-4 pl-5 pr-4">
                <p className="font-serif text-xl leading-snug text-white" style={{ fontFamily: "var(--font-playfair)" }}>
                  {"“The Lord is my light and my salvation — whom shall I fear?”"}
                </p>
                <cite className="mt-2 block text-[12px] uppercase not-italic tracking-[0.18em] text-[#FF9D4D]">Psalm 27:1</cite>
              </blockquote>
            </section>

            {/* ============ WHAT TO EXPECT ============ */}
            <section className="pt-9">
              <h2 className="px-5 text-[12px] font-semibold uppercase tracking-[0.24em] text-[#71717A] lg:px-0">
                What to expect
              </h2>
              <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] lg:px-0 [&::-webkit-scrollbar]:hidden">
                {[
                  { icon: <Music className="size-5" />, label: "Spirit-filled Worship" },
                  { icon: <HandHeart className="size-5" />, label: "Powerful Prayer" },
                  { icon: <Sparkles className="size-5" />, label: "Anointed Ministration" },
                  { icon: <HeartLine className="size-5" />, label: "Miracles & Breakthrough" },
                  { icon: <MessageSquareQuote className="size-5" />, label: "Testimonies" },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="flex min-w-[140px] snap-start flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#0B0B0B] p-4"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl border border-[#FF7A1A]/25 bg-[#FF7A1A]/10 text-[#FF9D4D]">
                      {f.icon}
                    </span>
                    <span className="text-[14px] font-medium leading-snug text-white text-pretty">{f.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ============ LOCATION ============ */}
            <section className="px-5 pt-9 lg:px-0">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#71717A]">Location</h2>
              <div className="mt-4 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0B0B0B]">
                <div className="relative h-32 w-full overflow-hidden">
                  {/* abstract dark map texture — intentionally quiet */}
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-40"
                    style={{
                      backgroundColor: "#0A0A0A",
                      backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                      backgroundSize: "26px 26px",
                    }}
                  />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0B0B0B] to-transparent" />
                  <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF6A00] shadow-[0_0_30px_rgba(255,106,0,0.7)]">
                    <MapPin className="size-4 text-black" />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 p-5">
                  <div className="leading-relaxed">
                    <p className="text-[15px] font-medium text-white">{EVENT.addressLine1}</p>
                    <p className="text-[14px] text-[#9C948C]">{EVENT.addressLine2}</p>
                  </div>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(EVENT.addressLine1 + ", " + EVENT.addressLine2)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.08]"
                  >
                    <Navigation className="size-3.5 text-[#FF9D4D]" />
                    Directions
                  </a>
                </div>
              </div>
            </section>

            {/* ============ EVENT DETAILS (accordion) ============ */}
            <section className="px-5 pb-40 pt-9 lg:px-0">
              <EventDetailsAccordion
                rows={[
                  ["Date", "Friday, 28 August 2026"],
                  ["Time", "00:00"],
                  ["Doors open", "23:30"],
                  ["Location", `${EVENT.addressLine1}, ${EVENT.addressLine2}`],
                  ["Entry", "Free"],
                  ["Registration", "Open"],
                ]}
              />
            </section>
          </div>

          {/* desktop sticky rail */}
          <aside className="hidden lg:block">
            <div className="sticky top-8 mt-6 rounded-[24px] border border-white/[0.08] bg-[#0B0B0B] p-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#FF9D4D]">Free event</p>
              <p className="mt-1 text-sm text-[#9C948C]">No registration fee</p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="group mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-[#FF6A00] to-[#FF9D4D] text-[15px] font-semibold text-black shadow-[0_14px_50px_-10px_rgba(255,122,26,0.65)] transition-all hover:shadow-[0_16px_60px_-8px_rgba(255,122,26,0.85)] active:scale-[0.98]"
              >
                Register for this event
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* ============ STICKY BAR (mobile) ============ */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 transition-all duration-300 lg:hidden ${
          showSticky ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto max-w-[460px] border-t border-white/[0.08] bg-black/80 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-white">Free event</p>
              <p className="text-[12px] text-[#9C948C]">No registration fee</p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="group ml-auto flex h-12 flex-1 items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-[#FF6A00] to-[#FF9D4D] text-[15px] font-semibold text-black shadow-[0_10px_36px_-10px_rgba(255,122,26,0.7)] transition-transform active:scale-[0.98]"
            >
              Register
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>

      <RegistrationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eventName={EVENT.name}
        organizer={EVENT.organizer}
        startISO={EVENT.startISO}
        endISO={EVENT.endISO}
        location={`${EVENT.addressLine1}, ${EVENT.addressLine2}`}
      />
    </div>
  )
}

function GlassBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60"
    >
      {children}
    </button>
  )
}

function Meta({
  icon,
  label,
  a,
  b,
  className = "",
}: {
  icon: React.ReactNode
  label: string
  a: string
  b: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.18em] text-[#71717A]">{label}</span>
      </div>
      <p className="mt-2 text-[14px] font-semibold leading-tight text-white text-pretty">{a}</p>
      <p className="mt-0.5 text-[12px] leading-tight text-[#9C948C]">{b}</p>
    </div>
  )
}

function EventDetailsAccordion({ rows }: { rows: [string, string][] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0B0B0B]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-[15px] font-semibold text-white">Event details</span>
        <ChevronDown className={`size-5 text-[#9C948C] transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <dl className="divide-y divide-white/[0.05] border-t border-white/[0.05] px-5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-3.5">
                <dt className="text-[13px] uppercase tracking-[0.12em] text-[#71717A]">{k}</dt>
                <dd className="max-w-[60%] text-right text-[14px] text-white">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
