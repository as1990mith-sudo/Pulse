"use client"

import { useEffect, useMemo, useState } from "react"
import { Mic, Images, AlignLeft, ArrowLeft, Plus, Info, Newspaper, PenLine } from "lucide-react"
import Link from "next/link"
import type { Show } from "@/lib/data"
import type { FeedPostView } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { UploadEpisode } from "@/components/upload-episode"
import { ProfilePostsGrid } from "@/components/profile/profile-posts-grid"
import { ArticleRow } from "@/components/articles/article-card"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type TabKey = "media" | "text" | "articles" | "catalogue"

export function ProfileTabs({
  name,
  isSelf,
  episodes,
  posts,
  articles,
  currentUser,
}: {
  name: string
  isSelf: boolean
  episodes: Show[]
  posts: FeedPostView[]
  articles: ArticleCardType[]
  currentUser: CurrentUser | null
}) {
  // Split posts into two feeds: media posts (an image or video attached) and
  // text-only posts (no media). Reposts are no longer a thing.
  const { mediaPosts, textPosts } = useMemo(() => {
    const mediaPosts: FeedPostView[] = []
    const textPosts: FeedPostView[] = []
    for (const p of posts) {
      if (p.media.length > 0) mediaPosts.push(p)
      else textPosts.push(p)
    }
    return { mediaPosts, textPosts }
  }, [posts])

  // Tab order: Media posts, Text posts, Catalogue. Saved bookmarks live on their
  // own page reached from the side menu.
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "media", label: "Media", icon: <Images className="size-4" />, count: mediaPosts.length },
    { key: "text", label: "Text", icon: <AlignLeft className="size-4" />, count: textPosts.length },
    { key: "articles", label: "Articles", icon: <Newspaper className="size-4" />, count: articles.length },
    { key: "catalogue", label: "Catalogue", icon: <Mic className="size-4" />, count: episodes.length },
  ]

  const [tab, setTab] = useState<TabKey>("media")
  // The tab the user was on before opening Catalogue, so the back arrow can
  // return them exactly where they were.
  const [prevTab, setPrevTab] = useState<TabKey>("media")
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
        ) : tab === "text" ? (
          textPosts.length === 0 ? (
            <EmptyState
              icon={<AlignLeft className="size-6" />}
              title="No text posts yet"
              message={
                isSelf
                  ? "Text-only posts you share from the Post tab will show up here."
                  : `${name} hasn't shared any text posts yet.`
              }
            />
          ) : (
            <ProfilePostsGrid posts={textPosts} currentUser={currentUser} />
          )
        ) : mediaPosts.length === 0 ? (
          <EmptyState
            icon={<Images className="size-6" />}
            title="No media posts yet"
            message={
              isSelf
                ? "Posts with a photo or video will show up here."
                : `${name} hasn't shared any photos or videos yet.`
            }
          />
        ) : (
          <ProfilePostsGrid posts={mediaPosts} currentUser={currentUser} />
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
            <h2 className="flex-1 text-base font-semibold">Catalogue</h2>

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
                  className="tap-scale flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105"
                >
                  <Plus className="size-5" />
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
