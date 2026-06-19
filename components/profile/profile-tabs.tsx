"use client"

import { useState } from "react"
import { Mic, MessageSquare } from "lucide-react"
import type { Show } from "@/lib/data"
import type { FeedPostView } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { PostCard } from "@/components/mind-feed"
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
  const [tab, setTab] = useState<"episodes" | "tweets">("episodes")

  return (
    <section className="mt-8 space-y-6">
      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/40 p-1">
        <button
          onClick={() => setTab("episodes")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "episodes" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "episodes"}
        >
          <Mic className="size-4" />
          Episodes{episodes.length > 0 ? ` (${episodes.length})` : ""}
        </button>
        <button
          onClick={() => setTab("tweets")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "tweets" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "tweets"}
        >
          <MessageSquare className="size-4" />
          Tweets{posts.length > 0 ? ` (${posts.length})` : ""}
        </button>
      </div>

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
          <EpisodeCatalog episodes={episodes} />
        )
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6" />}
          title="No tweets yet"
          message={
            isSelf
              ? "Share what's on your mind from the Tweet tab and your posts will show up here."
              : `${name} hasn't posted anything yet.`
          }
        />
      ) : (
        <ul className="mx-auto max-w-2xl space-y-4">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} currentUser={currentUser} />
            </li>
          ))}
        </ul>
      )}
    </section>
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
