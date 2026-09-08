import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicHost } from "@/lib/events/public"
import { getPublicHomeAnnouncements } from "@/app/actions/announcements"
import { AnnouncementBanner } from "@/components/announcement-banner"

type Params = { params: Promise<{ handle: string }> }

/**
 * Cacheable, but self-healing within a minute.
 *
 * This page reads no request-scoped API, so Next would otherwise prerender it
 * once and serve that copy indefinitely. Booking a place calls `revalidatePath`
 * for an immediate update; this interval is the backstop for changes that occur
 * outside a registration (an admin editing an event, or a date rolling over).
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
 * the EXACT members' Events experience ({@link AnnouncementBanner}) — the same
 * day rail, All/Today/This week/Later filters and featured hero — but with the
 * app header and footer stripped away (the bottom nav already hides on
 * `/events/[handle]`, and no SiteHeader is rendered here). Only events an admin
 * explicitly made public are included, and every card links out to its public
 * detail page, so an anonymous visitor never hits an in-app sign-in wall.
 */
export default async function PublicEventsPage({ params }: Params) {
  const { handle } = await params
  const host = await getPublicHost(handle)
  if (!host) notFound()

  const announcements = await getPublicHomeAnnouncements(host.homeId, host.handle)

  const home = {
    name: host.name,
    logo: host.logo,
    initials: host.initials,
    color: host.color,
    categoryLabel: host.categoryLabel,
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-primary/15 via-background to-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]"
      />
      <div className="relative">
        <main>
          <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-5">
            <AnnouncementBanner
              announcements={announcements}
              myRequests={[]}
              currentUser={null}
              isAdmin={false}
              canPublish={false}
              home={home}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
