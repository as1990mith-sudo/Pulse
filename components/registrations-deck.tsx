"use client"

import { useState } from "react"
import {
  ArrowUpRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessagesSquare,
  PenSquare,
  Radio,
  Users,
} from "lucide-react"

/* ------------------------------------------------------------------ *
 * Design system — every value here traces to the brief. Kept in one
 * place so nothing ad hoc leaks into the markup below.
 * ------------------------------------------------------------------ */
const C = {
  bg: "#0A0806", // near-black warm charcoal
  panel: "#141110", // card / donut-hole fill
  border: "rgba(255,225,190,0.09)",
  hair: "rgba(255,225,190,0.09)",
  accent: "#FF8A3D", // amber — the one signal color
  neutral: "rgba(255,225,190,0.16)", // "other" data segment, always quiet
  live: "#FF5D5D", // ONLY for happening-now pulse dots
  text: "#F5EFEA",
  text2: "#9C948C",
  text3: "#5B554F",
}
const glow = "0 0 22px rgba(255,138,61,0.30)"

const fDisplay = "font-[family-name:var(--font-deck-display)]"
const fBody = "font-[family-name:var(--font-deck-body)]"
const fMono = "font-[family-name:var(--font-deck-mono)]"

/* ------------------------------------------------------------------ *
 * Sample data
 * ------------------------------------------------------------------ */
type Status = "live" | "upcoming"
type EventRow = {
  id: string
  name: string
  status: Status
  date: string
  venue: string
  capacity: number | null // null = unlimited
  registered: number
  members: number
  guests: number
  attended: number
}

const ACTIVE: EventRow[] = [
  {
    id: "night-of-rescue",
    name: "Night of Rescue",
    status: "live",
    date: "Fri 28 Aug · 00:00",
    venue: "16 John Wilson St, SE18",
    capacity: 500,
    registered: 342,
    members: 214,
    guests: 128,
    attended: 187,
  },
  {
    id: "morning-prayers",
    name: "Morning Prayers",
    status: "upcoming",
    date: "Fri 28 Aug · 18:00",
    venue: "Unlimited places",
    capacity: null,
    registered: 96,
    members: 71,
    guests: 25,
    attended: 0,
  },
  {
    id: "youth-encounter",
    name: "Youth Encounter",
    status: "upcoming",
    date: "Sat 05 Sep · 16:00",
    venue: "Main Auditorium",
    capacity: 300,
    registered: 0,
    members: 0,
    guests: 0,
    attended: 0,
  },
]

const PAST = [
  { id: "hg-baptism", name: "Holy Ghost Baptism", date: "23 Aug", summary: "412 attended" },
  { id: "sunday-service", name: "Sunday Service", date: "17 Aug", summary: "388 attended" },
  { id: "healing-service", name: "Healing Service", date: "10 Aug", summary: "274 attended" },
]

const RECENT: Record<string, { name: string; tag: string; checkedIn: boolean }[]> = {
  "night-of-rescue": [
    { name: "Grace Adeyemi", tag: "MEMBER · 2H AGO", checkedIn: true },
    { name: "Daniel Okoro", tag: "GUEST · 3H AGO", checkedIn: true },
    { name: "Ruth Mensah", tag: "MEMBER · 5H AGO", checkedIn: false },
    { name: "Samuel Boateng", tag: "GUEST · 6H AGO", checkedIn: true },
    { name: "Esther Nwosu", tag: "MEMBER · 8H AGO", checkedIn: false },
  ],
  "morning-prayers": [
    { name: "Peter Owusu", tag: "MEMBER · 1H AGO", checkedIn: false },
    { name: "Joy Eze", tag: "MEMBER · 4H AGO", checkedIn: false },
    { name: "Michael Asante", tag: "GUEST · 7H AGO", checkedIn: false },
  ],
  "youth-encounter": [],
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/* ------------------------------------------------------------------ *
 * Donut — CSS conic-gradient ring with a masked inner circle punched
 * out in the panel color. Amber for the primary metric, neutral for
 * the remainder. `empty` renders a dashed placeholder ring.
 * ------------------------------------------------------------------ */
function Donut({
  percent,
  size,
  thickness,
  empty = false,
  hole = C.panel,
  children,
}: {
  percent: number
  size: number
  thickness: number
  empty?: boolean
  hole?: string
  children: React.ReactNode
}) {
  const deg = Math.max(0, Math.min(100, percent)) * 3.6
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {empty ? (
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: `1.5px dashed ${C.neutral}` }}
        />
      ) : (
        <>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${C.accent} ${deg}deg, ${C.neutral} ${deg}deg 360deg)`,
              boxShadow: percent > 0 ? glow : undefined,
            }}
          />
          <div
            className="absolute rounded-full"
            style={{ inset: thickness, background: hole }}
          />
        </>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children}
      </div>
    </div>
  )
}

/* Small reusable label + number stat column. */
function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5">
      <span
        className={`${fMono} text-[9px] uppercase tracking-[0.14em]`}
        style={{ color: C.text3 }}
      >
        {label}
      </span>
      <span className={`${fDisplay} text-lg font-bold`} style={{ color: accent ? C.accent : C.text }}>
        {value}
      </span>
    </div>
  )
}

/* Eyebrow: mono uppercase label + status dot + right-aligned count. */
function Eyebrow({
  label,
  dot,
  count,
  pulse = false,
}: {
  label: string
  dot: string
  count: number
  pulse?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span
        className="relative flex size-2 rounded-full"
        style={{ background: dot }}
      >
        {pulse && (
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: dot, animation: "deck-pulse 1.6s ease-in-out infinite" }}
          />
        )}
      </span>
      <span className={`${fMono} text-[10px] uppercase tracking-[0.22em]`} style={{ color: C.text2 }}>
        {label}
      </span>
      <span className="h-px flex-1" style={{ background: C.hair }} />
      <span className={`${fMono} text-[10px] tracking-[0.14em]`} style={{ color: C.text3 }}>
        {String(count).padStart(2, "0")}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * SCREEN 1 — grouped list
 * ------------------------------------------------------------------ */
function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  const live = ACTIVE.filter((e) => e.status === "live")
  const upcoming = ACTIVE.filter((e) => e.status === "upcoming")

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-5 pb-4 pt-5"
        style={{ background: `linear-gradient(${C.bg} 72%, transparent)` }}
      >
        <button
          type="button"
          className="grid size-9 place-items-center rounded-[11px]"
          style={{ border: `1px solid ${C.border}`, color: C.text2 }}
          aria-label="Menu"
        >
          <Menu className="size-[18px]" />
        </button>
        <h1 className={`${fDisplay} flex-1 truncate text-lg font-bold`} style={{ color: C.text }}>
          Prayer Palace
        </h1>
        <span
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{ border: `1px solid ${C.accent}`, boxShadow: glow }}
        >
          <span className="size-1.5 rounded-full" style={{ background: C.accent }} />
          <span className={`${fMono} text-[10px] uppercase tracking-[0.16em]`} style={{ color: C.accent }}>
            Premium
          </span>
        </span>
      </header>

      <div className="flex flex-col gap-7 px-5 pb-28">
        <p className={`${fBody} text-[13px] leading-relaxed`} style={{ color: C.text2 }}>
          See who has registered for the events you&apos;ve published, and email your attendees in a tap.
        </p>

        {/* LIVE block */}
        {live.length > 0 && (
          <section className="flex flex-col gap-3">
            <Eyebrow label="Happening now" dot={C.live} count={live.length} pulse />
            {live.map((e) => (
              <EventCard key={e.id} event={e} onOpen={onOpen} />
            ))}
          </section>
        )}

        {/* UPCOMING block */}
        <section className="flex flex-col gap-3">
          <Eyebrow label="Upcoming" dot={C.accent} count={upcoming.length} />
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} onOpen={onOpen} />
          ))}
        </section>

        {/* PAST block — collapsed low-opacity rows, no chrome */}
        <section className="flex flex-col gap-3">
          <Eyebrow label="Past" dot={C.text3} count={PAST.length} />
          <div className="flex flex-col">
            {PAST.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-3"
                style={{ borderTop: i === 0 ? undefined : `1px solid ${C.hair}`, opacity: 0.55 }}
              >
                <div className="flex items-baseline gap-2.5">
                  <span className={`${fBody} text-[13px] font-medium`} style={{ color: C.text }}>
                    {p.name}
                  </span>
                  <span className={`${fMono} text-[10px] tracking-[0.1em]`} style={{ color: C.text3 }}>
                    {p.date}
                  </span>
                </div>
                <span className={`${fMono} text-[10px] uppercase tracking-[0.12em]`} style={{ color: C.text2 }}>
                  {p.summary}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Secondary action */}
        <section className="flex flex-col gap-3">
          <Eyebrow label="Audiences" dot={C.text3} count={1} />
          <button
            type="button"
            className="flex items-center gap-3 rounded-[15px] px-4 py-4 text-left transition-colors"
            style={{ border: `1px solid ${C.border}`, background: C.panel }}
          >
            <span
              className="grid size-9 place-items-center rounded-[11px]"
              style={{ border: `1px solid ${C.border}`, color: C.accent }}
            >
              <Megaphone className="size-[18px]" />
            </span>
            <span className="flex flex-1 flex-col">
              <span className={`${fDisplay} text-sm font-semibold`} style={{ color: C.text }}>
                Email an audience
              </span>
              <span className={`${fMono} mt-0.5 text-[10px] uppercase tracking-[0.14em]`} style={{ color: C.text3 }}>
                Members · Guests · Attendees
              </span>
            </span>
            <ChevronRight className="size-4" style={{ color: C.text3 }} />
          </button>
        </section>
      </div>

      <TabBar />
    </div>
  )
}

function EventCard({ event: e, onOpen }: { event: EventRow; onOpen: (id: string) => void }) {
  const hasData = e.registered > 0
  const memberPct = pct(e.members, e.registered)

  return (
    <article className="overflow-hidden rounded-[16px]" style={{ border: `1px solid ${C.border}`, background: C.panel }}>
      <div className="flex items-start gap-3 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <h3 className={`${fDisplay} truncate text-[17px] font-bold`} style={{ color: C.text }}>
            {e.name}
          </h3>
          <div className="flex items-center gap-2">
            <Calendar className="size-3.5 shrink-0" style={{ color: C.text3 }} />
            <span className={`${fMono} text-[11px] tracking-[0.06em]`} style={{ color: C.text2 }}>
              {e.date}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {e.capacity === null ? (
              <Users className="size-3.5 shrink-0" style={{ color: C.text3 }} />
            ) : (
              <MapPin className="size-3.5 shrink-0" style={{ color: C.text3 }} />
            )}
            <span className={`${fBody} truncate text-[12px]`} style={{ color: C.text2 }}>
              {e.venue}
            </span>
          </div>
        </div>

        {/* Ring badge + drill-in */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Donut percent={memberPct} size={34} thickness={5} empty={!hasData}>
            {hasData ? (
              <span className={`${fDisplay} text-[10px] font-bold`} style={{ color: C.text }}>
                {memberPct}%
              </span>
            ) : (
              <span className={`${fMono} text-[10px]`} style={{ color: C.text3 }}>
                —
              </span>
            )}
          </Donut>
          <span className={`${fMono} text-[8px] uppercase tracking-[0.14em]`} style={{ color: C.text3 }}>
            {hasData ? "Members" : "No data"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpen(e.id)}
          className="grid size-8 shrink-0 place-items-center rounded-[10px] transition-transform active:scale-90"
          style={{ background: "rgba(255,138,61,0.12)", border: `1px solid rgba(255,138,61,0.25)`, color: C.accent }}
          aria-label={`Open ${e.name}`}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Stat strip — equal columns, hairline dividers */}
      <div
        className="grid grid-cols-3"
        style={{ borderTop: `1px solid ${C.hair}` }}
      >
        {[
          { label: "Registered", value: e.registered },
          { label: "Members", value: e.members },
          { label: "Guests", value: e.guests },
        ].map((s, i) => (
          <div key={s.label} style={{ borderLeft: i === 0 ? undefined : `1px solid ${C.hair}` }}>
            <Stat label={s.label} value={String(s.value)} />
          </div>
        ))}
      </div>
    </article>
  )
}

/* ------------------------------------------------------------------ *
 * SCREEN 2 — detail
 * ------------------------------------------------------------------ */
function DetailView({ event: e, onBack }: { event: EventRow; onBack: () => void }) {
  const hasData = e.registered > 0
  const memberPct = pct(e.members, e.registered)
  const checkinPct = pct(e.attended, e.registered)
  const noShow = Math.max(0, e.registered - e.attended)
  const recent = RECENT[e.id] ?? []

  return (
    <div className="flex flex-col pb-28">
      {/* Back row */}
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-5 pb-3 pt-5"
        style={{ background: `linear-gradient(${C.bg} 78%, transparent)` }}
      >
        <button
          type="button"
          onClick={onBack}
          className="grid size-9 place-items-center rounded-[11px]"
          style={{ border: `1px solid ${C.border}`, color: C.text2 }}
          aria-label="Back to events"
        >
          <ChevronLeft className="size-[18px]" />
        </button>
        <span className={`${fMono} text-[10px] uppercase tracking-[0.22em]`} style={{ color: C.text3 }}>
          Registrations / Event
        </span>
      </header>

      <div className="flex flex-col gap-6 px-5">
        {/* Title + meta */}
        <div className="flex flex-col gap-2 pt-1">
          <h1 className={`${fDisplay} text-[26px] font-bold leading-tight`} style={{ color: C.text }}>
            {e.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {e.status === "live" && (
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ background: C.live, animation: "deck-pulse 1.6s ease-in-out infinite" }}
                />
                <span className={`${fMono} text-[10px] uppercase tracking-[0.18em]`} style={{ color: C.live }}>
                  Live now
                </span>
              </span>
            )}
            <span className={`${fMono} text-[11px] tracking-[0.06em]`} style={{ color: C.text2 }}>
              {e.date}
            </span>
            <span className={`${fBody} text-[12px]`} style={{ color: C.text3 }}>
              {e.venue}
            </span>
          </div>
        </div>

        {/* Two donut cards */}
        <div className="grid grid-cols-2 gap-3">
          <DonutCard
            label="Attendee mix"
            percent={memberPct}
            empty={!hasData}
            centerValue={hasData ? `${memberPct}%` : "—"}
            centerSub="Members"
            legend={[
              { color: C.accent, label: "Members", value: e.members },
              { color: C.neutral, label: "Guests", value: e.guests },
            ]}
          />
          <DonutCard
            label="Check-in rate"
            percent={checkinPct}
            empty={!hasData}
            centerValue={hasData ? `${checkinPct}%` : "—"}
            centerSub="Checked in"
            legend={[
              { color: C.accent, label: "Checked in", value: e.attended },
              { color: C.neutral, label: "No-show", value: noShow },
            ]}
          />
        </div>

        {/* Breakdown 2x2 */}
        <section className="flex flex-col gap-3">
          <span className={`${fMono} px-1 text-[10px] uppercase tracking-[0.22em]`} style={{ color: C.text3 }}>
            Breakdown
          </span>
          <div className="grid grid-cols-2 gap-3">
            <BreakdownBox label="Registered" value={e.registered} primary />
            <BreakdownBox label="Members" value={e.members} />
            <BreakdownBox label="Guests" value={e.guests} />
            <BreakdownBox label="Checked in" value={e.attended} />
          </div>
        </section>

        {/* Recent registrations preview */}
        <section className="flex flex-col gap-3">
          <span className={`${fMono} px-1 text-[10px] uppercase tracking-[0.22em]`} style={{ color: C.text3 }}>
            Recent registrations
          </span>
          {recent.length === 0 ? (
            <div
              className="rounded-[15px] px-4 py-6 text-center"
              style={{ border: `1px dashed ${C.border}`, background: C.panel }}
            >
              <span className={`${fBody} text-[13px]`} style={{ color: C.text3 }}>
                No registrations yet.
              </span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[15px]" style={{ border: `1px solid ${C.border}`, background: C.panel }}>
              {recent.map((r, i) => (
                <div
                  key={r.name}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: i === 0 ? undefined : `1px solid ${C.hair}` }}
                >
                  <span
                    className={`${fDisplay} grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold`}
                    style={{ background: "rgba(255,225,190,0.08)", color: C.text2 }}
                  >
                    {r.name.charAt(0)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`${fBody} truncate text-[13px] font-medium`} style={{ color: C.text }}>
                      {r.name}
                    </span>
                    <span className={`${fMono} mt-0.5 text-[9px] uppercase tracking-[0.14em]`} style={{ color: C.text3 }}>
                      {r.tag}
                    </span>
                  </span>
                  {r.checkedIn && (
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full"
                      style={{ background: "rgba(255,138,61,0.12)", color: C.accent }}
                      aria-label="Checked in"
                    >
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {recent.length > 0 && (
            <button
              type="button"
              className={`${fMono} flex items-center justify-center gap-1.5 py-1 text-[11px] uppercase tracking-[0.16em]`}
              style={{ color: C.accent }}
            >
              View all {e.registered} registrations
              <ArrowUpRight className="size-3.5" />
            </button>
          )}
        </section>
      </div>

      {/* Bottom action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[420px] items-center gap-3 px-5 pb-6 pt-4"
        style={{ background: `linear-gradient(transparent, ${C.bg} 32%)` }}
      >
        <button
          type="button"
          className={`${fDisplay} flex flex-1 items-center justify-center gap-2 rounded-[13px] py-3.5 text-sm font-semibold`}
          style={{ background: C.accent, color: "#1A0E04", boxShadow: glow }}
        >
          <Mail className="size-4" />
          Email attendees
        </button>
        <button
          type="button"
          className="grid size-[50px] shrink-0 place-items-center rounded-[13px]"
          style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.text2 }}
          aria-label="Export CSV"
        >
          <Download className="size-[18px]" />
        </button>
      </div>
    </div>
  )
}

function DonutCard({
  label,
  percent,
  empty,
  centerValue,
  centerSub,
  legend,
}: {
  label: string
  percent: number
  empty: boolean
  centerValue: string
  centerSub: string
  legend: { color: string; label: string; value: number }[]
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] p-4" style={{ border: `1px solid ${C.border}`, background: C.panel }}>
      <span className={`${fMono} text-[9.5px] uppercase tracking-[0.16em]`} style={{ color: C.text3 }}>
        {label}
      </span>
      <div className="flex justify-center py-1">
        <Donut percent={percent} size={104} thickness={13} empty={empty}>
          <span className={`${fDisplay} text-[22px] font-bold`} style={{ color: C.text }}>
            {centerValue}
          </span>
          <span className={`${fMono} mt-1 text-[8px] uppercase tracking-[0.14em]`} style={{ color: C.text3 }}>
            {centerSub}
          </span>
        </Donut>
      </div>
      <div className="flex flex-col gap-1.5">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: l.color }} />
            <span className={`${fBody} flex-1 truncate text-[11px]`} style={{ color: C.text2 }}>
              {l.label}
            </span>
            <span className={`${fMono} text-[11px]`} style={{ color: C.text }}>
              {l.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BreakdownBox({ label, value, primary = false }: { label: string; value: number; primary?: boolean }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-[15px] p-4"
      style={{
        border: `1px solid ${primary ? "rgba(255,138,61,0.28)" : C.border}`,
        background: primary
          ? "linear-gradient(150deg, rgba(255,138,61,0.16), rgba(255,138,61,0.03))"
          : C.panel,
        boxShadow: primary ? glow : undefined,
      }}
    >
      <span className={`${fMono} text-[9.5px] uppercase tracking-[0.16em]`} style={{ color: primary ? C.accent : C.text3 }}>
        {label}
      </span>
      <span className={`${fDisplay} text-[26px] font-bold leading-none`} style={{ color: C.text }}>
        {value}
      </span>
    </div>
  )
}

/* Fixed bottom tab bar — active tab in the accent color. */
function TabBar() {
  const tabs = [
    { icon: Home, label: "Home", active: true },
    { icon: PenSquare, label: "Compose", active: false },
    { icon: MessagesSquare, label: "Rooms", active: false },
    { icon: Radio, label: "Live", active: false },
  ]
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[420px] items-center justify-around px-5 pb-6 pt-3"
      style={{ background: `linear-gradient(transparent, ${C.bg} 30%)` }}
    >
      <div
        className="flex w-full items-center justify-around rounded-[18px] px-2 py-3"
        style={{ border: `1px solid ${C.border}`, background: C.panel }}
      >
        {tabs.map((t) => (
          <button
            key={t.label}
            type="button"
            className="grid place-items-center px-4"
            style={{ color: t.active ? C.accent : C.text3 }}
            aria-label={t.label}
          >
            <t.icon className="size-[22px]" style={{ filter: t.active ? "drop-shadow(0 0 8px rgba(255,138,61,0.5))" : undefined }} />
          </button>
        ))}
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ *
 * Root — two views connected by tap-to-drill-in.
 * ------------------------------------------------------------------ */
export function RegistrationsDeck() {
  const [openId, setOpenId] = useState<string | null>(null)
  const openEvent = ACTIVE.find((e) => e.id === openId) ?? null

  return (
    <main className={`${fBody} min-h-screen w-full`} style={{ background: C.bg, color: C.text }}>
      {/* Self-contained keyframes for the happening-now pulse (1 → 0.3, ~1.6s). */}
      <style>{`@keyframes deck-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
      <div className="mx-auto w-full max-w-[420px]">
        {openEvent ? (
          <DetailView event={openEvent} onBack={() => setOpenId(null)} />
        ) : (
          <ListView onOpen={setOpenId} />
        )}
      </div>
    </main>
  )
}
