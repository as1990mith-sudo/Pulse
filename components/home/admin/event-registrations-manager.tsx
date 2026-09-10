"use client"

import { useMemo } from "react"
import Link from "next/link"
import { CalendarDays, ChevronRight, UserPlus, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EventRegistrationSummary } from "@/app/actions/event-admin"
import {
  CountStrip,
  EYEBROW,
  eventStatus,
  formatWhen,
  Ring,
  StatusDot,
  type EventStatus,
} from "./events/shared"

export function EventRegistrationsManager({
  handle,
  events,
}: {
  handle: string
  events: EventRegistrationSummary[]
}) {
  const { live, upcoming, past } = useMemo(() => {
    const registerable = events.filter((e) => e.registrationEnabled)
    const live = registerable.filter((e) => eventStatus(e) === "live")
    const upcoming = registerable
      .filter((e) => eventStatus(e) === "upcoming")
      .sort((a, b) => (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999"))
    const past = registerable
      .filter((e) => eventStatus(e) === "past")
      .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""))
    return { live, upcoming, past }
  }, [events])

  const total = live.length + upcoming.length + past.length

  if (total === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-14 text-center">
        <div
          className="mb-5 flex size-14 items-center justify-center rounded-2xl text-white shadow-elevated"
          style={{ backgroundColor: "var(--home-accent)", boxShadow: "0 0 26px -6px var(--home-accent)" }}
        >
          <UserPlus className="size-6" />
        </div>
        <h2 className="font-display text-lg font-bold tracking-tight">No events taking registrations</h2>
        <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Turn on registration for an event and everyone who signs up — members and visitors alike — will appear here
          with their details and answers.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      {live.length > 0 && (
        <Block label="Happening now" dot="live" count={live.length}>
          {live.map((ev) => (
            <EventCard key={ev.id} handle={handle} event={ev} status="live" />
          ))}
        </Block>
      )}

      {upcoming.length > 0 && (
        <Block label="Upcoming" dot="upcoming" count={upcoming.length}>
          {upcoming.map((ev) => (
            <EventCard key={ev.id} handle={handle} event={ev} status="upcoming" />
          ))}
        </Block>
      )}

      {past.length > 0 && (
        <Block label="Past" dot="past" count={past.length}>
          {past.map((ev) => (
            <PastRow key={ev.id} handle={handle} event={ev} />
          ))}
        </Block>
      )}
    </div>
  )
}

/** Labelled section: status dot + eyebrow + hairline + right-aligned count. */
function Block({
  label,
  dot,
  count,
  children,
}: {
  label: string
  dot: EventStatus
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5 px-0.5">
        <StatusDot kind={dot} />
        <span className={cn(EYEBROW, "text-muted-foreground")}>{label}</span>
        <span className="h-px flex-1 bg-border" />
        <span className="text-[10px] tabular-nums text-muted-foreground">{String(count).padStart(2, "0")}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/**
 * A live/upcoming event as a tappable card. The whole card is one link to the
 * event's dedicated page — no in-place expansion — so the registrant list opens
 * as a full page transition, matching how the members console drills in.
 */
function EventCard({
  handle,
  event,
  status,
}: {
  handle: string
  event: EventRegistrationSummary
  status: EventStatus
}) {
  return (
    <Link
      href={`/org/${handle}/admin/event/${event.id}`}
      aria-label={`View registrations for ${event.title}`}
      className="tap-scale group block overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl transition-colors hover:border-[color:var(--home-accent)]/40"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          {status === "live" && (
            <span className={cn(EYEBROW, "mb-1 flex items-center gap-1.5 text-live")}>Live today</span>
          )}
          {/* Wraps rather than truncates: event titles are long and often differ
              only near the end ("...Sunday Service" vs "...Sunday Seminar"). */}
          <h3 className="text-pretty font-display text-base font-bold leading-tight tracking-tight">{event.title}</h3>
          <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0" /> {formatWhen(event.eventDate, event.eventTime)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5 shrink-0" />
              {event.capacity !== null
                ? `${event.counts.seats} of ${event.capacity} places taken`
                : "Unlimited places"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <Ring members={event.counts.members} total={event.counts.total} />
          <span className={cn(EYEBROW, "text-muted-foreground")}>Members</span>
        </div>
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl border transition-colors"
          style={{
            backgroundColor: "color-mix(in oklch, var(--home-accent) 14%, transparent)",
            borderColor: "color-mix(in oklch, var(--home-accent) 30%, transparent)",
            color: "var(--home-accent)",
          }}
        >
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      <CountStrip counts={event.counts} />
    </Link>
  )
}

/**
 * A past event collapses to a single low-opacity line — no card, no chart — and
 * links to its dedicated page, where the registration list can still be reviewed
 * after the fact.
 */
function PastRow({ handle, event }: { handle: string; event: EventRegistrationSummary }) {
  return (
    <Link
      href={`/org/${handle}/admin/event/${event.id}`}
      aria-label={`View registrations for ${event.title}`}
      className="tap-scale flex w-full items-center gap-3 px-1 py-2 text-left opacity-55 transition-opacity hover:opacity-90"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-semibold">{event.title}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {formatWhen(event.eventDate, event.eventTime)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-display text-sm font-bold tabular-nums">{event.counts.total}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Registered</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  )
}
