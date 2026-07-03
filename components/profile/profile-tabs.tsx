"use client"

import { useEffect, useState } from "react"
import { Mic, MessageSquare, Repeat2, ArrowLeft } from "lucide-react"
import type { Show } from "@/lib/data"
import type { FeedPostView } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { UploadEpisode } from "@/components/upload-episode"
import { ProfilePostsGrid } from "@/components/profile/profile-posts-grid"
import { cn } from "@/lib/utils"

type TabKey = "posts" | "reposts" | "catalogue"

export function ProfileTabs({
  name,
  isSelf,
  episodes,
  posts,
  reposts,
  currentUser,
}: {
  name: string
  isSelf: boolean
  episodes: Show[]
  posts: FeedPostView[]
  reposts: FeedPostView[]
  currentUser: CurrentUser | null
}) {
  // Tab order: Posts, Reposts, Catalogue. Saved bookmarks now live on their own
  // page reached from the side menu.
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "posts", label: "Posts", icon: <MessageSquare className="size-4" />, count: posts.length },
    { key: "reposts", label: "Reposts", icon: <Repeat2 className="size-4" />, count: reposts.length },
    { key: "catalogue", label: "Catalogue", icon: <Mic className="size-4" />, count: episodes.length },
  ]

  const [tab, setTab] = useState<TabKey>("posts")
  // The tab the user was on before opening Catalogue, so the back arrow can
  // return them exactly where they were.
  const [prevTab, setPrevTab] = useState<TabKey>("posts")
  const catalogueOpen = tab === "catalogue"
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === tab),
  )

  // Catalogue opens as an immersive full-screen view, so lock background scroll
  // while it's open and restore it on close.
  useEffect(() => {
    if (!catalogueOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [catalogueOpen])

  function selectTab(key: TabKey) {
    // Remember where we came from when entering Catalogue.
    if (key === "catalogue" && tab !== "catalogue") setPrevTab(tab)
    setTab(key)
  }

  return (
    <section className="mt-2">
      {/* Instagram-style tab bar: full-width, uppercase labels, sliding top
          indicator on the active tab. Sits on a top border like IG. */}
      <div
        className="relative -mx-4 grid border-t border-border/60 sm:-mx-6"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => (
          <TabButton
            key={t.key}
            active={tab === t.key}
            onClick={() => selectTab(t.key)}
            icon={t.icon}
            label={t.label}
            count={t.count}
          />
        ))}
        {/* Sliding active indicator */}
        <span
          className="absolute -top-px left-0 h-0.5 bg-foreground transition-transform duration-300 ease-out"
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
          aria-hidden
        />
      </div>

      {/* Content with a smooth fade/slide transition between tabs. Catalogue is
          rendered separately as a full-screen overlay below. */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-300 pt-4">
        {tab === "catalogue" ? null : tab === "reposts" ? (
          reposts.length === 0 ? (
            <EmptyState
              icon={<Repeat2 className="size-6" />}
              title="No reposts yet"
              message={
                isSelf
                  ? "Reposts you make from the feed will show up here for your followers to discover."
                  : `${name} hasn't reposted anything yet.`
              }
            />
          ) : (
            <ProfilePostsGrid posts={reposts} currentUser={currentUser} />
          )
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="size-6" />}
            title="No posts yet"
            message={
              isSelf
                ? "Share what's on your mind from the Post tab and your posts will show up here."
                : `${name} hasn't posted anything yet.`
            }
          />
        ) : (
          <ProfilePostsGrid posts={posts} currentUser={currentUser} />
        )}
      </div>

      {/* Catalogue opens full-screen, hiding the app/profile header. Only a back
          arrow remains, returning the user to the tab they came from. */}
      {catalogueOpen && (
        <div className="fixed left-0 top-0 z-50 flex h-[100dvh] w-screen flex-col bg-background animate-in fade-in slide-in-from-bottom-2 duration-300">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setTab(prevTab)}
              aria-label="Back"
              className="tap-scale -ml-1 flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary/60"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h2 className="text-base font-semibold">Catalogue</h2>
          </header>

          <div data-scroll className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl space-y-4">
              {/* Owners can upload their own audio/video episodes here. */}
              {isSelf && <UploadEpisode />}
              {episodes.length === 0 ? (
                <EmptyState
                  icon={<Mic className="size-6" />}
                  title="No published episodes yet"
                  message={
                    isSelf
                      ? "Upload an audio or video episode above, or finish a live session in the studio to publish one automatically."
                      : `${name} hasn't published any episodes yet. Follow them to know when they go live.`
                  }
                />
              ) : (
                <EpisodeCatalog episodes={episodes} owned={isSelf} />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {/* Only the active tab reveals its label (+ count); the rest stay icon-only.
          Keep the label on a single line so the icon stays vertically aligned
          with the icon-only tabs instead of centering against wrapped text. */}
      <span className={cn("whitespace-nowrap", !active && "sr-only")}>
        {label}
        {count > 0 ? ` ${count}` : ""}
      </span>
    </button>
  )
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-pretty text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
