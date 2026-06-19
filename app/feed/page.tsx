import { SiteHeader } from "@/components/site-header"
import { MindFeed } from "@/components/mind-feed"
import { AnnouncementBanner } from "@/components/announcement-banner"
import { StatusBar } from "@/components/status-bar"
import { getFeed } from "@/app/actions/feed"
import { getActiveAnnouncements } from "@/app/actions/announcements"
import { getStatusFeed } from "@/app/actions/status"
import { getCurrentUser } from "@/lib/session"

export default async function FeedPage() {
  const [posts, currentUser, announcements, statusGroups] = await Promise.all([
    getFeed(),
    getCurrentUser(),
    getActiveAnnouncements(),
    getStatusFeed(),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="border-b border-border/60 bg-card/40">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-10 sm:px-6 md:py-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Community</span>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">What&apos;s on your mind</h1>
            <p className="text-pretty text-base text-muted-foreground leading-relaxed">
              Share a thought, ask a question, or post a photo. Like, repost, and reply to keep the conversation going.
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8 sm:px-6">
          <AnnouncementBanner announcements={announcements} currentUser={currentUser} />
          <StatusBar groups={statusGroups} currentUser={currentUser} />
          <MindFeed posts={posts} currentUser={currentUser} />
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>Frequency — live podcast streaming.</p>
          <p>Built as a demo. Posts are saved to your account.</p>
        </div>
      </footer>
    </div>
  )
}
