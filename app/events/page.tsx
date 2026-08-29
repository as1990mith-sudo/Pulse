import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { AnnouncementBanner } from "@/components/announcement-banner"
import {
  getActiveAnnouncements,
  getMyAnnouncements,
  isPlatformAdmin,
  canPublishEvents,
} from "@/app/actions/announcements"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Events",
  description: "Discover and register for upcoming events from your Home.",
}

export default async function EventsPage() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in to view events</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Events are gatherings shared by your Home. Sign in to browse and register.
          </p>
          <Link
            href="/sign-in"
            className="mt-6 inline-flex items-center rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </main>
      </div>
    )
  }

  const [announcements, myRequests, isAdmin, canPublish] = await Promise.all([
    getActiveAnnouncements(),
    getMyAnnouncements(),
    isPlatformAdmin(),
    canPublishEvents(),
  ])

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-primary/15 via-background to-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]"
      />
      <div className="relative">
        <SiteHeader />
        <main>
          <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-2 sm:px-5">
            <AnnouncementBanner
              announcements={announcements}
              myRequests={myRequests}
              currentUser={currentUser}
              isAdmin={isAdmin}
              canPublish={canPublish}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
