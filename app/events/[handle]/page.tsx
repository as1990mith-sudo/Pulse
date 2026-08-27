import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicHost, listPublicEventsForBrowser } from "@/lib/events/public"
import { PublicEventsBrowser } from "@/components/events/public-events-browser"

type Params = { params: Promise<{ handle: string }> }

/**
 * Cacheable, but self-healing within a minute.
 *
 * This page reads no request-scoped API, so Next would otherwise prerender it
 * once and serve that copy indefinitely — which is exactly what happened during
 * testing: a sold-out event kept advertising "Register" and showing 0 places
 * taken. Booking a place calls `revalidatePath` for an immediate update, and
 * this interval is the backstop for changes that occur outside a registration
 * (an admin editing capacity, or the event date simply rolling over).
 */
export const revalidate = 60

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
 * A Home's public events listing — the discovery + registration surface.
 *
 * Deliberately requires NO account and no membership: this is the page an
 * external visitor lands on from a shared link or a flyer QR code. It renders
 * only events whose admin explicitly enabled a public page. Grouping, filtering
 * and search happen client-side in {@link PublicEventsBrowser}; the server's
 * job is just to resolve the host and hand over the published events.
 */
export default async function PublicEventsPage({ params }: Params) {
  const { handle } = await params
  const host = await getPublicHost(handle)
  if (!host) notFound()

  const events = await listPublicEventsForBrowser(host.homeId)

  return <PublicEventsBrowser host={host} events={events} />
}
