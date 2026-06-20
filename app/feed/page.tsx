import { SiteHeader } from "@/components/site-header"
import { MindFeed } from "@/components/mind-feed"
import { AnnouncementBanner } from "@/components/announcement-banner"
import { StatusBar } from "@/components/status-bar"
import { getFeed } from "@/app/actions/feed"
import { getActiveAnnouncements, getMyAnnouncements, isPlatformAdmin } from "@/app/actions/announcements"
import { getStatusFeed } from "@/app/actions/status"
import { getCurrentUser } from "@/lib/session"

export default async function FeedPage() {
  const [posts, currentUser, announcements, myRequests, statusGroups, isAdmin] = await Promise.all([
    getFeed(),
    getCurrentUser(),
    getActiveAnnouncements(),
    getMyAnnouncements(),
    getStatusFeed(),
    isPlatformAdmin(),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-xl pb-8">
          {/* Stories rail sits at the very top, edge-to-edge like Instagram. */}
          <div className="border-b border-border/60 px-4 py-3 sm:px-0">
            <StatusBar groups={statusGroups} currentUser={currentUser} />
          </div>
          <div className="pt-4 pb-5">
            <AnnouncementBanner
              announcements={announcements}
              myRequests={myRequests}
              currentUser={currentUser}
              isAdmin={isAdmin}
            />
          </div>
          {/* …while the feed itself runs edge-to-edge for an immersive scroll. */}
          <MindFeed posts={posts} currentUser={currentUser} />
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <p>Frequency — live podcast streaming.</p>
        </div>
      </footer>
    </div>
  )
}
