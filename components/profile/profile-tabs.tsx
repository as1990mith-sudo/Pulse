"use client"

import { useState } from "react"
import Link from "next/link"
import { Mic, MessageSquare, Repeat2, Bookmark } from "lucide-react"
import type { Show } from "@/lib/data"
import type { FeedPostView } from "@/app/actions/feed"
import type { SavedItemView } from "@/app/actions/share"
import type { CurrentUser } from "@/lib/session"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { ProfilePostsGrid } from "@/components/profile/profile-posts-grid"
import { cn } from "@/lib/utils"

type TabKey = "posts" | "reposts" | "catalogue" | "saved"

export function ProfileTabs({
  name,
  isSelf,
  episodes,
  posts,
  reposts,
  saved,
  currentUser,
}: {
  name: string
  isSelf: boolean
  episodes: Show[]
  posts: FeedPostView[]
  reposts: FeedPostView[]
  saved: SavedItemView[]
  currentUser: CurrentUser | null
}) {
  // Tab order: Posts, Reposts, Catalogue, Saved. "Saved" is private — only the
  // profile owner sees it.
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "posts", label: "Posts", icon: <MessageSquare className="size-4" />, count: posts.length },
    { key: "reposts", label: "Reposts", icon: <Repeat2 className="size-4" />, count: reposts.length },
    { key: "catalogue", label: "Catalogue", icon: <Mic className="size-4" />, count: episodes.length },
    ...(isSelf
      ? [{ key: "saved" as const, label: "Saved", icon: <Bookmark className="size-4" />, count: saved.length }]
      : []),
  ]

  const [tab, setTab] = useState<TabKey>("posts")
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === tab),
  )

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
            onClick={() => setTab(t.key)}
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

      {/* Content with a smooth fade/slide transition between tabs. */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-300 pt-4">
        {tab === "catalogue" ? (
          episodes.length === 0 ? (
            <EmptyState
              icon={<Mic className="size-6" />}
              title="No published episodes yet"
              message={
                isSelf
                  ? "When you finish a live session in the studio it's published here automatically for your followers to browse."
                  : `${name} hasn't published any episodes yet. Follow them to know when they go live.`
              }
            />
          ) : (
            <EpisodeCatalog episodes={episodes} owned={isSelf} />
          )
        ) : tab === "reposts" ? (
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
        ) : tab === "saved" ? (
          saved.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="size-6" />}
              title="Nothing saved yet"
              message="Tap the bookmark on any post, episode, or devotional to save it here. Only you can see your saved items."
            />
          ) : (
            <SavedGrid items={saved} />
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
    </section>
  )
}

/** Grid of saved bookmarks linking back to each item's page. */
function SavedGrid({ items }: { items: SavedItemView[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.url}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:bg-secondary/50"
          >
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-muted-foreground">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image || "/placeholder.svg"} alt="" className="size-full object-cover" />
              ) : (
                <Bookmark className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.title ?? "Saved item"}</p>
              {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
              <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {item.type}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
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
      className={cn(
        "flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span>
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
