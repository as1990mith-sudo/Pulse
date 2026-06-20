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
        <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8 sm:px-6">
          <AnnouncementBanner
            announcements={announcements}
            myRequests={myRequests}
            currentUser={currentUser}
            isAdmin={isAdmin}
          />
          <StatusBar groups={statusGroups} currentUser={currentUser} />
          <MindFeed posts={posts} currentUser={currentUser} />
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>Frequency — live podcast streaming.</p>
        </div>
      </footer>
    </div>
  )
}
