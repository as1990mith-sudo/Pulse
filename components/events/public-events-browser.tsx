"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Bell,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Compass,
  Home as HomeIcon,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Radio,
  Search,
  SlidersHorizontal,
  Ticket,
  User,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { PublicEventBrowserCard, PublicHostInfo } from "@/lib/events/public"

type Props = {
  host: PublicHostInfo
  events: PublicEventBrowserCard[]
}

type FilterKey = "all" | "upcoming" | "past"
type GroupKey = "today" | "tomorrow" | "week" | "later" | "past"

const GROUP_LABELS: Record<GroupKey, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This Week",
  later: "Later",
  past: "Past Events",
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Local midnight for a YYYY-MM-DD string, avoiding UTC parse drift. */
function midnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Whole days from today's midnight to the event's midnight (negative = past). */
function daysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = midnight(dateStr).getTime() - today.getTime()
  return Math.round(diff / 86_400_000)
}

function bucketFor(ev: PublicEventBrowserCard): GroupKey {
  if (ev.isPast) return "past"
  if (!ev.eventDate) return "later"
  const d = daysFromToday(ev.eventDate)
  if (d <= 0) return "today"
  if (d === 1) return "tomorrow"
  if (d <= 7) return "week"
  return "later"
}

/** { AUG, 24, Mon } for the date block; falls back to a dash when undated. */
function dateParts(dateStr: string | null): { mon: string; day: string; dow: string } {
  if (!dateStr) return { mon: "—", day: "··", dow: "TBC" }
  const d = midnight(dateStr)
  return { mon: MONTHS[d.getMonth()], day: String(d.getDate()), dow: DAYS[d.getDay()] }
}

/** "Sat, 22 Aug · 15:00" style line for the card metadata. */
function whenLine(dateStr: string | null, time: string | null): string {
  if (!dateStr) return time ?? "Date to be confirmed"
  const d = midnight(dateStr)
  const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
  return time ? `${label} · ${time}` : label
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All Events" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
]

const GROUP_ORDER: GroupKey[] = ["today", "tomorrow", "week", "later", "past"]

export function PublicEventsBrowser({ host, events }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all")
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [saved, setSaved] = useState<Record<number, boolean>>({})
  const searchRef = useRef<HTMLInputElement>(null)

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const groups: Record<GroupKey, PublicEventBrowserCard[]> = {
      today: [],
      tomorrow: [],
      week: [],
      later: [],
      past: [],
    }
    for (const ev of events) {
      if (filter === "upcoming" && ev.isPast) continue
      if (filter === "past" && !ev.isPast) continue
      if (q) {
        const hay = `${ev.title} ${ev.location ?? ""}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      groups[bucketFor(ev)].push(ev)
    }
    return groups
  }, [events, filter, query])

  const visibleGroups = GROUP_ORDER.filter((g) => grouped[g].length > 0)
  const totalVisible = visibleGroups.reduce((n, g) => n + grouped[g].length, 0)

  return (
    <div className="min-h-dvh bg-background pb-24 text-foreground">
      {/* ---- Top navigation ------------------------------------------------ */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-3 sm:px-5">
          <IconButton label="Open menu">
            <Menu className="size-5" />
          </IconButton>

          <Link href={`/events/${host.handle}`} className="ml-1 flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-[0_0_18px_-2px] shadow-primary/60">
              <Radio className="size-[18px]" />
            </span>
            <span className="truncate font-display text-lg font-bold tracking-tight">Frequency</span>
          </Link>

          <div className="ml-auto flex items-center gap-0.5">
            <IconButton label="Messages">
              <MessageSquare className="size-5" />
            </IconButton>
            <IconButton label="Notifications">
              <span className="relative">
                <Bell className="size-5" />
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />
              </span>
            </IconButton>
            <IconButton
              label="Search events"
              onClick={() => {
                setSearchOpen((v) => !v)
                requestAnimationFrame(() => searchRef.current?.focus())
              }}
            >
              <Search className="size-5" />
            </IconButton>
          </div>
        </div>

        {/* Slide-down search field */}
        <div
          className={cn(
            "mx-auto grid max-w-5xl px-3 transition-all duration-300 ease-out sm:px-5",
            searchOpen ? "grid-rows-[1fr] pb-3 opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events or locations"
                aria-label="Search events"
                className="h-11 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-5">
        {/* ---- Page header ------------------------------------------------- */}
        <div className="flex items-center gap-3 pt-7">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_0_22px_-4px] shadow-primary/60">
            <CalendarDays className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold leading-none tracking-tight text-balance">Events</h1>
            <p className="mt-1.5 truncate text-sm text-muted-foreground">
              Discover upcoming events and experiences
            </p>
          </div>
        </div>

        {/* ---- Filter / discovery controls --------------------------------- */}
        <div className="mt-5 flex items-center gap-2">
          <div className="-mx-4 flex-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max items-center gap-2">
              {FILTERS.map((f) => {
                const active = filter === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={active}
                    className={cn(
                      "h-9 shrink-0 rounded-full border px-4 text-sm font-semibold transition-all duration-200",
                      active
                        ? "border-primary/40 bg-primary text-primary-foreground shadow-[0_0_18px_-4px] shadow-primary/60"
                        : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            aria-label="Filter events"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
            <span>Filter</span>
          </button>
        </div>

        {/* ---- Grouped sections -------------------------------------------- */}
        {totalVisible === 0 ? (
          <EmptyState hostName={host.name} filtered={Boolean(query) || filter !== "all"} />
        ) : (
          <div className="mt-6 space-y-8">
            {visibleGroups.map((g) => (
              <section key={g} aria-label={GROUP_LABELS[g]}>
                <div className="mb-3 flex items-center gap-2">
                  <CalendarDays className="size-4 text-primary" />
                  <h2 className="font-display text-lg font-semibold tracking-tight">{GROUP_LABELS[g]}</h2>
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-secondary px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
                    {grouped[g].length}
                  </span>
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
                  >
                    View all
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {grouped[g].map((ev) => (
                    <li key={ev.id}>
                      <EventCard
                        ev={ev}
                        host={host}
                        saved={Boolean(saved[ev.id])}
                        onToggleSave={() => setSaved((s) => ({ ...s, [ev.id]: !s[ev.id] }))}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">Hosted on Frequency by {host.name}</p>
      </main>

      <BottomNav />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Event card
 * ------------------------------------------------------------------------- */

function EventCard({
  ev,
  host,
  saved,
  onToggleSave,
}: {
  ev: PublicEventBrowserCard
  host: PublicHostInfo
  saved: boolean
  onToggleSave: () => void
}) {
  const { mon, day, dow } = dateParts(ev.eventDate)
  const href = `/events/${host.handle}/${ev.id}`

  return (
    <div className="group relative flex flex-col gap-3 rounded-[18px] border border-border bg-card p-3 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_28px_-8px] hover:shadow-primary/50">
      <div className="flex gap-3">
        {/* Poster thumbnail */}
        <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl bg-secondary sm:w-24">
          {ev.flyer ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ev.flyer || "/placeholder.svg"}
              alt={`Poster for ${ev.title}`}
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <CalendarDays className="size-6" />
            </div>
          )}
        </div>

        {/* Date block */}
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-secondary/40 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{mon}</span>
          <span className="font-display text-2xl font-bold leading-none">{day}</span>
          <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{dow}</span>
        </div>

        {/* Title + meta */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-1">
            <h3 className="min-w-0 flex-1 font-display text-[15px] font-semibold leading-snug text-balance sm:text-base">
              {ev.title}
            </h3>
            <button
              type="button"
              onClick={onToggleSave}
              aria-label={saved ? `Remove ${ev.title} from saved` : `Save ${ev.title}`}
              aria-pressed={saved}
              className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary"
            >
              <Bookmark className={cn("size-[18px]", saved && "fill-primary text-primary")} />
            </button>
          </div>

          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0 text-primary/80" />
            <span className="truncate">{whenLine(ev.eventDate, ev.eventTime)}</span>
          </p>
          {ev.location ? (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{ev.location}</span>
            </p>
          ) : null}
          {ev.isPast ? (
            <span className="mt-1.5 w-fit text-xs font-medium text-muted-foreground">Event ended</span>
          ) : ev.isFull ? (
            <span className="mt-1.5 w-fit rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              Fully booked
            </span>
          ) : ev.capacity !== null ? (
            <span className="mt-1.5 w-fit text-xs font-medium text-muted-foreground">
              {ev.capacity - ev.registeredCount} places left
            </span>
          ) : null}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 border-t border-border/60 pt-3">
        <button
          type="button"
          aria-label={`More options for ${ev.title}`}
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </button>

        {ev.isPast ? (
          <Link
            href={href}
            className="flex h-9 flex-1 items-center justify-center rounded-lg border border-border bg-secondary/40 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            View recap
          </Link>
        ) : (
          <Link
            href={href}
            aria-label={`Register for ${ev.title}`}
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-[0_0_20px_-6px] shadow-primary/70 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          >
            {ev.isFull ? "Join waitlist" : "Register"}
          </Link>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Bits
 * ------------------------------------------------------------------------- */

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full text-foreground/90 transition-colors hover:bg-secondary/60 hover:text-foreground"
    >
      {children}
    </button>
  )
}

function EmptyState({ hostName, filtered }: { hostName: string; filtered: boolean }) {
  return (
    <div className="mt-10 rounded-2xl border border-border bg-card px-6 py-16 text-center">
      <CalendarDays className="mx-auto size-6 text-muted-foreground" />
      <h2 className="mt-4 font-display text-base font-semibold">
        {filtered ? "No matching events" : "No events yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
        {filtered
          ? "Try a different filter or search term."
          : `${hostName} hasn't published any public events yet. Check back soon.`}
      </p>
    </div>
  )
}

function BottomNav() {
  const items = [
    { icon: HomeIcon, label: "Home" },
    { icon: Compass, label: "Discover" },
    { icon: CalendarDays, label: "Events", active: true },
    { icon: Ticket, label: "Bookings" },
    { icon: User, label: "Profile" },
  ]
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/85 backdrop-blur-xl"
    >
      <ul className="mx-auto flex max-w-5xl items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {items.map(({ icon: Icon, label, active }) => (
          <li key={label} className="flex-1">
            <button
              type="button"
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[22px]", active && "drop-shadow-[0_0_8px] drop-shadow-primary/60")} />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
