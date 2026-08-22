"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Mic, ArrowLeft, Plus, Info, Newspaper, PenLine, LayoutGrid, MessagesSquare } from "lucide-react"
import Link from "next/link"
import type { Show } from "@/lib/data"
import type { CommunityPostView } from "@/app/actions/community"
import type { FeedPostView } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { UploadEpisode } from "@/components/upload-episode"
import { ProfileThreads } from "@/components/profile/profile-threads"
import { PostCard } from "@/components/mind-feed"
import { ArticleRow } from "@/components/articles/article-card"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type TabKey = "posts" | "thread" | "articles" | "catalogue"

export function ProfileTabs({
  name,
  isSelf,
  currentUser,
  episodes,
  feedPosts,
  communityPosts,
  anonymousPosts,
  articles,
  showCatalogue = false,
}: {
  name: string
  isSelf: boolean
  // The viewer, needed by <PostCard> for engagement/ownership controls.
  currentUser: CurrentUser | null
  episodes: Show[]
  // The user's own MAIN-FEED posts — the "Posts" timeline.
  feedPosts: FeedPostView[]
  // Public (identifiable) Community Help posts — part of the "Thread" timeline.
  communityPosts: CommunityPostView[]
  // The owner's own anonymous Community Help posts — only ever passed for isSelf.
  anonymousPosts: CommunityPostView[]
  articles: ArticleCardType[]
  // Whether to show the Catalogue (live episodes) tab. Only true for admin/staff
  // profiles — members don't host, so the tab is hidden for them.
  showCatalogue?: boolean
}) {
  // The "Thread" tab merges the user's Community Help posts (identifiable +, for
  // the owner only, anonymous) into a single newest-first timeline. Anonymous
  // posts are only ever supplied for the owner, so nothing leaks on someone
  // else's profile — their anonymous questions simply never appear here.
  const threadPosts = useMemo(
    () => [...communityPosts, ...anonymousPosts].sort((a, b) => b.createdAtMs - a.createdAtMs),
    [communityPosts, anonymousPosts],
  )

  // Tab order: Posts (main feed), Thread (Community Help), Articles, Catalogue.
  // Catalogue is only present on admin/staff profiles (see showCatalogue).
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "posts", label: "Posts", icon: <LayoutGrid className="size-4" />, count: feedPosts.length },
    { key: "thread", label: "Thread", icon: <MessagesSquare className="size-4" />, count: threadPosts.length },
    { key: "articles", label: "Articles", icon: <Newspaper className="size-4" />, count: articles.length },
    ...(showCatalogue
      ? [{ key: "catalogue" as const, label: "Catalogue", icon: <Mic className="size-4" />, count: episodes.length }]
      : []),
  ]

  // Initialize the active tab from the URL (?tab=…). This makes the selection
  // survive navigation: opening a Catalogue item routes to /live/[id], and the
  // browser/router back button restores /u/[id]?tab=catalogue, so the profile
  // reopens on Catalogue instead of resetting to Posts.
  const searchParams = useSearchParams()
  const tabFromUrl = ((): TabKey => {
    const t = searchParams.get("tab")
    // "anonymous" is the legacy key for what is now the "Thread" tab.
    if (t === "anonymous") return "thread"
    // Ignore ?tab=catalogue when the Catalogue tab is hidden for this profile.
    if (t === "catalogue") return showCatalogue ? "catalogue" : "posts"
    return t === "thread" || t === "articles" || t === "posts" ? t : "posts"
  })()
  const [tab, setTab] = useState<TabKey>(tabFromUrl)
  // The tab the user was on before opening Catalogue, so the back arrow can
  // return them exactly where they were.
  const [prevTab, setPrevTab] = useState<TabKey>("posts")
  // Whether the inline upload form is open (triggered from the header + button).
  const [uploadOpen, setUploadOpen] = useState(false)
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
    // Reflect the tab in the URL (without a navigation) so it's restored when
    // the user returns from an opened item. Next.js syncs replaceState with
    // useSearchParams. Posts is the default, so it needs no query param.
    if (typeof window !== "undefined") {
      const url = key === "posts" ? window.location.pathname : `${window.location.pathname}?tab=${key}`
      window.history.replaceState(null, "", url)
    }
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
        {tab === "catalogue" ? null : tab === "articles" ? (
          articles.length === 0 ? (
            <EmptyState
              icon={<Newspaper className="size-6" />}
              title="No articles yet"
              message={
                isSelf
                  ? "Long-form articles you publish will appear here."
                  : `${name} hasn't published any articles yet.`
              }
              action={
                isSelf ? (
                  <Link
                    href="/articles/write"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  >
                    <PenLine className="size-4" /> Write an Article
                  </Link>
                ) : null
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {articles.map((a) => (
                <ArticleRow key={a.id} article={a} />
              ))}
            </div>
          )
        ) : tab === "thread" ? (
          threadPosts.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare className="size-6" />}
              title="No threads yet"
              message={
                isSelf
                  ? "Questions and prayers you share on Community Help appear here as a timeline."
                  : `${name} hasn't shared anything on Community Help yet.`
              }
              action={
                isSelf ? (
                  <Link
                    href="/chatrooms/community"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  >
                    <Plus className="size-4" /> Post to Community Help
                  </Link>
                ) : null
              }
            />
          ) : (
            <ProfileThreads posts={threadPosts} mode="thread" />
          )
        ) : tab === "posts" ? (
          feedPosts.length === 0 ? (
            <EmptyState
              icon={<LayoutGrid className="size-6" />}
              title="No posts yet"
              message={
                isSelf
                  ? "Posts you share on the main feed will show up here."
                  : `${name} hasn't posted to the feed yet.`
              }
              action={
                isSelf ? (
                  <Link
                    href="/feed"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  >
                    <Plus className="size-4" /> Post to the feed
                  </Link>
                ) : null
              }
            />
          ) : (
            /* Immersive timeline: the "feed" variant drops the card border and
               background, and the negative inset cancels the profile page's
               horizontal padding so each post spans the full screen width,
               divided only by hairlines. */
            <div className="-mx-4 flex flex-col divide-y divide-border/60 border-t border-border/60 sm:-mx-6">
              {feedPosts.map((p) => (
                <PostCard key={p.id} post={p} currentUser={currentUser} variant="feed" />
              ))}
            </div>
          )
        ) : null}
      </div>

      {/* Catalogue opens full-screen, hiding the app/profile header. Only a back
          arrow remains, returning the user to the tab they came from. */}
      {catalogueOpen && (
        <div className="fixed left-0 top-0 z-50 flex h-[100dvh] w-screen flex-col bg-background animate-in fade-in slide-in-from-bottom-2 duration-300">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/50 bg-background/70 px-4 py-4 backdrop-blur-xl sm:px-5">
            <button
              type="button"
              onClick={() => selectTab(prevTab)}
              aria-label="Back"
              className="tap-scale -ml-1 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h2 className="flex-1 font-display text-lg font-semibold tracking-tight">Catalogue</h2>

            {/* Owner tools live top-right, opposite the back arrow: an info
                popover with the upload hint, and the add (+) trigger. Moving
                these out of a full card frees vertical room for episodes. */}
            {isSelf && (
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Upload instructions"
                    className="tap-scale flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                  >
                    <Info className="size-5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 p-3">
                    <p className="text-sm font-semibold">Upload to catalogue</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add an audio or video episode from your device.
                    </p>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  aria-label="Upload episode"
                  className="tap-scale ml-0.5 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-primary/20 transition-transform hover:scale-105 active:scale-95"
                >
                  <Plus className="size-[18px]" strokeWidth={2.25} />
                </button>
              </div>
            )}
          </header>

          <div data-scroll className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl space-y-4">
              {/* Owners can upload their own audio/video episodes here. The
                  trigger lives in the header; this renders the inline form. */}
              {isSelf && <UploadEpisode open={uploadOpen} onOpenChange={setUploadOpen} />}
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

function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-pretty text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}
