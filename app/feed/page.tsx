import { SiteHeader } from "@/components/site-header"
import { MindFeed } from "@/components/mind-feed"
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
        <div className="mx-auto w-full max-w-2xl pb-8">
          {/* Status now lives inside the feed tabs (For you / Following / Status /
              Reels); the feed runs edge-to-edge for an immersive scroll. The
              Announcements banner renders inside the feed so it can be hidden on
              the Status tab. */}
          <MindFeed
            posts={posts}
            currentUser={currentUser}
            statusGroups={statusGroups}
            announcements={announcements}
            myRequests={myRequests}
            isAdmin={isAdmin}
          />
        </div>
      </main>
    </div>
  )
}
