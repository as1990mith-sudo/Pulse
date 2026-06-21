"use client"

import { useState } from "react"
import { Mic, MessageSquare } from "lucide-react"
import type { Show } from "@/lib/data"
import type { FeedPostView } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { ProfilePostsGrid } from "@/components/profile/profile-posts-grid"
import { cn } from "@/lib/utils"

export function ProfileTabs({
  name,
  isSelf,
  episodes,
  posts,
  currentUser,
}: {
  name: string
  isSelf: boolean
  episodes: Show[]
  posts: FeedPostView[]
  currentUser: CurrentUser | null
}) {
  const [tab, setTab] = useState<"posts" | "episodes">("posts")

  return (
    <section className="mt-2">
      {/* Instagram-style tab bar: full-width, uppercase labels, sliding top
          indicator on the active tab. Sits on a top border like IG. */}
      <div className="relative -mx-4 grid grid-cols-2 border-t border-border/60 sm:-mx-6">
        <TabButton
          active={tab === "posts"}
          onClick={() => setTab("posts")}
          icon={<MessageSquare className="size-4" />}
          label="Posts"
          count={posts.length}
        />
        <TabButton
          active={tab === "episodes"}
          onClick={() => setTab("episodes")}
          icon={<Mic className="size-4" />}
          label="Episodes"
          count={episodes.length}
        />
        {/* Sliding active indicator */}
        <span
          className="absolute -top-px left-0 h-0.5 w-1/2 bg-foreground transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${tab === "posts" ? "0%" : "100%"})` }}
          aria-hidden
        />
      </div>

      {/* Content with a smooth fade/slide transition between tabs. */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-300 pt-4">
        {tab === "episodes" ? (
          episodes.length === 0 ? (
            <EmptyState
              icon={<Mic className="size-6" />}
              title="No published episodes yet"
              message={
                isSelf
                  ? "When you finish a live session in the studio, publish it and it will appear here for your followers to browse."
                  : `${name} hasn't published any episodes yet. Follow them to know when they go live.`
              }
            />
          ) : (
            <EpisodeCatalog episodes={episodes} owned={isSelf} />
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
