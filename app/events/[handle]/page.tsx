import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarDays, MapPin, Users } from "lucide-react"
import { getPublicHost, listPublicEvents, formatEventWhen } from "@/lib/events/public"

type Params = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params
  const host = await getPublicHost(handle)
  if (!host) return { title: "Events — Frequency" }
  return {
    title: `Events · ${host.name}`,
    description: host.description ?? `Upcoming events hosted by ${host.name}.`,
  }
}

/**
 * A Home's public events listing.
 *
 * Deliberately requires NO account and no membership: this is the page an
 * external visitor lands on from a shared link or a flyer QR code. It renders
 * only events whose admin explicitly enabled a public page.
 */
export default async function PublicEventsPage({ params }: Params) {
  const { handle } = await params
  const host = await getPublicHost(handle)
  if (!host) notFound()

  const events = await listPublicEvents(host.homeId)

  return (
    <main className="min-h-dvh bg-background">
      {/* Host header. Kept quiet so the events themselves carry the page. */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
          <div className="flex items-center gap-3">
            {host.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={host.logo || "/placeholder.svg"}
                alt=""
                className="size-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
              >
                {host.initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Events</p>
              <h1 className="truncate font-display text-xl font-semibold text-balance text-foreground">{host.name}</h1>
            </div>
          </div>
          {host.description ? (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground text-pretty">{host.description}</p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {events.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center">
            <CalendarDays className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-4 font-display text-base font-semibold text-card-foreground">No upcoming events</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
              {host.name} hasn&apos;t published any public events yet. Check back soon.
            </p>
          </div>
        ) : (
          /* The flyer leads. Event posters carry the whole visual identity of a
             church event — date, speaker, venue are all designed into the
             artwork — so shrinking one to a thumbnail throws away the reason
             someone stops to look. One column on phones, two from `sm`. */
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {events.map((ev) => {
              const when = formatEventWhen(ev.eventDate, ev.eventTime)
              return (
                <li key={ev.id}>
                  <Link
                    href={`/events/${host.handle}/${ev.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {ev.flyer ? (
                      <div className="relative aspect-[4/5] overflow-hidden bg-secondary">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ev.flyer || "/placeholder.svg"}
                          alt={`Poster for ${ev.title}`}
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                        {/* Status rides on the artwork rather than competing with
                            the title below, mirroring the "Free" chip already
                            used on event cards elsewhere in Frequency. */}
                        {ev.isFull ? (
                          <span className="absolute left-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
                            Full
                          </span>
                        ) : ev.open ? (
                          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                            Register
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                      {when ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                          {when}
                        </span>
                      ) : null}
                      <h2 className="font-display text-base font-semibold leading-snug text-card-foreground text-balance">
                        {ev.title}
                      </h2>
                      {/* No flyer? The status chip has nowhere to ride, so show
                          it inline instead of dropping it entirely. */}
                      {!ev.flyer && (ev.isFull || ev.open) ? (
                        <span
                          className={
                            ev.isFull
                              ? "w-fit rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                              : "w-fit rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
                          }
                        >
                          {ev.isFull ? "Full" : "Register"}
                        </span>
                      ) : null}
                      <div className="mt-auto flex flex-col gap-1 text-sm text-muted-foreground">
                        {ev.location ? (
                          <span className="flex items-center gap-2">
                            <MapPin className="size-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">{ev.location}</span>
                          </span>
                        ) : null}
                        {ev.capacity !== null ? (
                          <span className="flex items-center gap-2">
                            <Users className="size-4 shrink-0" aria-hidden="true" />
                            {ev.registeredCount} of {ev.capacity} places taken
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Hosted on Frequency by {host.name}
        </p>
      </div>
    </main>
  )
}
