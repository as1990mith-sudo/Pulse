import { notFound } from "next/navigation"
import Link from "next/link"
import { CalendarDays, ChevronLeft, Users } from "lucide-react"
import { getHomeEventRegistrations } from "@/app/actions/event-admin"
import { EventRegistrationList } from "@/components/home/admin/events/event-registration-list"
import { CountStrip, EYEBROW, eventStatus, formatWhen, Ring } from "@/components/home/admin/events/shared"
import { cn } from "@/lib/utils"

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ handle: string; eventId: string }>
}) {
  const { handle, eventId } = await params
  const id = Number(eventId)
  if (!Number.isInteger(id)) notFound()

  // Reuses the list query (permission-checked, Home-scoped) and picks the one
  // event — no separate fetch path to keep counts identical to the events list.
  const events = await getHomeEventRegistrations(handle)
  const event = events.find((e) => e.id === id)
  if (!event) notFound()

  const status = eventStatus(event)

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/org/${handle}/admin/events`}
        className="tap-scale inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Events
      </Link>

      <article className="overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl">
        <div className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            {status === "live" && (
              <span className={cn(EYEBROW, "mb-1 flex items-center gap-1.5 text-live")}>Live today</span>
            )}
            {status === "upcoming" && (
              <span className={cn(EYEBROW, "mb-1 block text-muted-foreground")}>Upcoming</span>
            )}
            {status === "past" && <span className={cn(EYEBROW, "mb-1 block text-muted-foreground")}>Past event</span>}
            <h1 className="text-balance font-display text-xl font-bold leading-tight tracking-tight">{event.title}</h1>
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 shrink-0" /> {formatWhen(event.eventDate, event.eventTime)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5 shrink-0" />
                {event.capacity !== null ? `${event.counts.seats} of ${event.capacity} places taken` : "Unlimited places"}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <Ring members={event.counts.members} total={event.counts.total} size={48} />
            <span className={cn(EYEBROW, "text-muted-foreground")}>Members</span>
          </div>
        </div>

        <CountStrip counts={event.counts} />
      </article>

      <section>
        <h2 className={cn(EYEBROW, "mb-3 text-muted-foreground")}>Registrations</h2>
        <EventRegistrationList handle={handle} eventId={event.id} eventTitle={event.title} />
      </section>
    </div>
  )
}
