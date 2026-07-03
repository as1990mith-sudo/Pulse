import { SiteHeader } from "@/components/site-header"
import { MindFeed } from "@/components/mind-feed"
import { AnnouncementBanner } from "@/components/announcement-banner"
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
          <div className="pt-4 pb-5">
            <AnnouncementBanner
              announcements={announcements}
              myRequests={myRequests}
              currentUser={currentUser}
              isAdmin={isAdmin}
            />
          </div>
          {/* Status now lives inside the feed tabs (For you / Following / Status /
              Reels); the feed runs edge-to-edge for an immersive scroll. */}
          <MindFeed posts={posts} currentUser={currentUser} statusGroups={statusGroups} />
        </div>
      </main>
    </div>
  )
}
