import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { RegistrationPanel } from "@/components/events/registration-panel"
import { formatEventWhen } from "@/lib/events/public"
import {
  countRegistrations,
  loadEventByHandle,
  readConfig,
  registrationWindow,
  resolveIdentity,
  type EventQuestion,
} from "@/lib/events/registration"

type Params = { params: Promise<{ handle: string; id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle, id } = await params
  const loaded = await loadEventByHandle(handle, Number(id))
  if (!loaded) return { title: "Event — Frequency" }
  return {
    title: `${loaded.event.title} · ${loaded.homeName}`,
    description: loaded.event.description ?? `An event hosted by ${loaded.homeName}.`,
    openGraph: {
      title: loaded.event.title,
      description: loaded.event.description ?? `An event hosted by ${loaded.homeName}.`,
      images: loaded.event.flyer ? [loaded.event.flyer] : undefined,
    },
  }
}

/**
 * A single event's public page and registration surface.
 *
 * Reachable with no account. A signed-in member sees the same page, but the
 * registration panel collapses to one tap because their details are already
 * known — the identity resolution happens here on the server so nothing about
 * the viewer's status has to be trusted from the client.
 */
export default async function PublicEventPage({ params }: Params) {
  const { handle, id } = await params
  const announcementId = Number(id)
  if (!Number.isInteger(announcementId)) notFound()

  const loaded = await loadEventByHandle(handle, announcementId)
  if (!loaded) notFound()

  const { event, homeId, homeName, homeHandle, orgLogo } = loaded
  const config = readConfig(event)

  // The public page is opt-in. Without it the event may still take member
  // registrations in-app, but has no business being on the open web.
  if (!config.publicPage && !config.enabled) notFound()

  const viewer = await getCurrentUser()
  const identity = await resolveIdentity({ homeId, announcementId, userId: viewer?.id ?? null })
  const counts = await countRegistrations(db, announcementId)
  const window = registrationWindow(event)

  const isFull = config.capacity !== null && counts.total >= config.capacity
  const when = formatEventWhen(event.eventDate, event.eventTime)
  const closedReason =
    window.reason === "closed"
      ? "Registration for this event has closed."
      : window.reason === "passed"
        ? "This event has already taken place."
        : null

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href={`/events/${homeHandle}`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All events
        </Link>

        {event.flyer ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.flyer || "/placeholder.svg"}
            alt={`Flyer for ${event.title}`}
            className="mb-6 aspect-[3/2] w-full rounded-2xl object-cover"
          />
        ) : null}

        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {orgLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={orgLogo || "/placeholder.svg"} alt="" className="size-6 rounded-full object-cover" />
            ) : null}
            <span>Hosted by {homeName}</span>
          </div>
          <h1 className="font-display text-2xl font-semibold leading-tight text-balance text-foreground sm:text-3xl">
            {event.title}
          </h1>
        </header>

        <dl className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
          {when ? (
            <div className="flex items-start gap-3">
              <dt className="sr-only">When</dt>
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <dd className="text-card-foreground">{when}</dd>
            </div>
          ) : null}
          {event.location ? (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Where</dt>
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <dd className="text-card-foreground">{event.location}</dd>
            </div>
          ) : null}
          {config.capacity !== null ? (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Places</dt>
              <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <dd className="text-card-foreground">
                {isFull ? "Fully booked" : `${config.capacity - counts.total} of ${config.capacity} places left`}
              </dd>
            </div>
          ) : null}
        </dl>

        {event.description ? (
          <div className="mt-6">
            <h2 className="sr-only">About this event</h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
              {event.description.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="text-pretty">
                  {para}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8">
          <RegistrationPanel
            handle={homeHandle}
            announcementId={announcementId}
            eventTitle={event.title}
            knownName={identity.knownName}
            knownEmail={identity.knownEmail}
            knownPhone={identity.knownPhone}
            isMember={identity.isMember}
            alreadyRegistered={identity.isRegistrant}
            requiresPhone={config.requiresPhone}
            questions={config.questions as EventQuestion[]}
            open={window.open && config.enabled}
            closedReason={closedReason}
            isFull={isFull}
            // Members-only when the admin took registrations without publishing
            // a public page. Anyone may register when the public page is on.
            canRegister={config.publicPage || identity.isMember}
            signInHref={`/login?next=/events/${homeHandle}/${announcementId}`}
          />
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Hosted on Frequency by{" "}
          <Link href={`/org/${homeHandle}`} className="underline underline-offset-2">
            {homeName}
          </Link>
        </p>
      </div>
    </main>
  )
}
