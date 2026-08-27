import type { Metadata } from "next"
import { Playfair_Display } from "next/font/google"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { RegistrationPanel } from "@/components/events/registration-panel"
import { CinematicEventDetail } from "@/components/events/cinematic-event-detail"
import { formatEventWhen } from "@/lib/events/public"
import {
  countRegistrations,
  eventStart,
  loadEventByHandle,
  readConfig,
  registrationWindow,
  resolveIdentity,
  type EventQuestion,
} from "@/lib/events/registration"

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
})

type Params = {
  params: Promise<{ handle: string; id: string }>
  searchParams: Promise<{ from?: string }>
}

/**
 * Always rendered per request, never cached.
 *
 * This page resolves the VIEWER's identity — whether they are signed in, a
 * member of this Home, and whether they already hold a place — to decide
 * between one-tap registration and the full form. Serving a cached copy would
 * show one visitor's state to another, so the correctness requirement here is
 * stricter than on the listing (which is merely time-revalidated).
 */
export const dynamic = "force-dynamic"

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
 * A single event's public page and registration surface — cinematic shell.
 *
 * Reachable with no account. The heavy lifting (identity, capacity, the open
 * window) is resolved here on the server; {@link CinematicEventDetail} is a
 * presentational shell and the real registration still runs through
 * {@link RegistrationPanel}, handed in as children so this redesign never forks
 * the working submit flow.
 */
export default async function PublicEventPage({ params, searchParams }: Params) {
  const { handle, id } = await params
  const { from } = await searchParams
  const announcementId = Number(id)
  if (!Number.isInteger(announcementId)) notFound()

  const loaded = await loadEventByHandle(handle, announcementId)
  if (!loaded) notFound()

  const { event, homeId, homeName, homeHandle, orgLogo, accentColor } = loaded
  const config = readConfig(event)

  // The public page is opt-in. Without it the event may still take member
  // registrations in-app, but has no business being on the open web.
  if (!config.publicPage && !config.enabled) notFound()

  const viewer = await getCurrentUser()
  const identity = await resolveIdentity({ homeId, announcementId, userId: viewer?.id ?? null })
  const counts = await countRegistrations(db, announcementId)
  const window = registrationWindow(event)

  const isFull = config.capacity !== null && counts.total >= config.capacity
  const open = window.open && config.enabled
  const canRegister = config.publicPage || identity.isMember
  const closedReason =
    window.reason === "closed"
      ? "Registration for this event has closed."
      : window.reason === "passed"
        ? "This event has already taken place."
        : null

  // Display values for the cinematic shell.
  const dateLabel = formatEventWhen(event.eventDate, null)
  const timeLabel = event.eventTime && /^\d{2}:\d{2}$/.test(event.eventTime) ? event.eventTime : null
  const start = eventStart(event)
  const startISO = start && start.getTime() > Date.now() ? start.toISOString() : null
  const capacityNote =
    config.capacity !== null
      ? isFull
        ? "Fully booked"
        : `${Math.max(0, config.capacity - counts.seats)} of ${config.capacity} places left`
      : null

  // Collapse the overlapping states into one presentational mode for the shell's
  // sticky bar. The panel below still renders the authoritative explanation.
  const mode: "open" | "full" | "closed" | "members" | "registered" = identity.isRegistrant
    ? "registered"
    : isFull
      ? "full"
      : !open
        ? "closed"
        : !canRegister
          ? "members"
          : "open"

  // Route Back to wherever the viewer actually came from. Cards in the in-feed
  // Events tab link with ?from=feed, so a member who opened the event there is
  // returned to that tab (/feed?tab=events) rather than being dumped on the
  // public browser they never visited. Everyone else goes to the public browser.
  const backHref = from === "feed" ? "/feed?tab=events" : `/events/${homeHandle}`

  return (
    <main className={playfair.variable}>
      <CinematicEventDetail
        backHref={backHref}
        title={event.title}
        homeName={homeName}
        homeHandle={homeHandle}
        orgLogo={orgLogo}
        accentColor={accentColor}
        flyer={event.flyer}
        description={event.description}
        dateLabel={dateLabel}
        timeLabel={timeLabel}
        location={event.location}
        startISO={startISO}
        capacityNote={capacityNote}
        mode={mode}
        signInHref={`/login?next=/events/${homeHandle}/${announcementId}`}
      >
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
          open={open}
          closedReason={closedReason}
          isFull={isFull}
          canRegister={canRegister}
          signInHref={`/login?next=/events/${homeHandle}/${announcementId}`}
        />
      </CinematicEventDetail>
    </main>
  )
}
