"use client"

import { useMemo, useState } from "react"
import { Plus, Newspaper, PenLine, LayoutGrid, MessagesSquare } from "lucide-react"
import { useUrlState } from "@/lib/navigation/use-url-state"
import Link from "next/link"
import type { CommunityPostView } from "@/app/actions/community"
import type { FeedPostView } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import { CommunityThreadFeed } from "@/components/community-help"
import { PostCard } from "@/components/mind-feed"
import { ArticleRow } from "@/components/articles/article-card"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["posts", "thread", "articles"] as const
type TabKey = (typeof TAB_KEYS)[number]

export function ProfileTabs({
  name,
  isSelf,
  homeName,
  currentUser,
  feedPosts,
  communityPosts,
  anonymousPosts,
  articles,
}: {
  name: string
  isSelf: boolean
  /**
   * The active Home this profile is being read in, or null in Personal mode.
   * Every timeline below is scoped to it, so the empty states name it outright —
   * "nothing in Grace Community yet" is the truth, whereas a bare "no posts yet"
   * would read as "this person has never posted" when they may simply be active
   * in another Home.
   */
  homeName: string | null
  // The viewer, needed by <PostCard> for engagement/ownership controls.
  currentUser: CurrentUser | null
  // The user's own MAIN-FEED posts — the "Posts" timeline.
  feedPosts: FeedPostView[]
  // Public (identifiable) Community Help posts — part of the "Thread" timeline.
  communityPosts: CommunityPostView[]
  // The owner's own anonymous Community Help posts — only ever passed for isSelf.
  anonymousPosts: CommunityPostView[]
  articles: ArticleCardType[]
}) {
  // The "Thread" tab merges the user's Community Help posts (identifiable +, for
  // the owner only, anonymous) into a single newest-first timeline. Anonymous
  // posts are only ever supplied for the owner, so nothing leaks on someone
  // else's profile — their anonymous questions simply never appear here.
  const threadPosts = useMemo(
    () => [...communityPosts, ...anonymousPosts].sort((a, b) => b.createdAtMs - a.createdAtMs),
    [communityPosts, anonymousPosts],
  )

  // Names the context every timeline is scoped to. In Personal mode there is no
  // Home, so the copy stays generic rather than inventing a place name.
  const inScope = homeName ? ` in ${homeName}` : ""

  // Tab order: Posts (main feed), Thread (Community Help), Articles.
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "posts", label: "Posts", icon: <LayoutGrid className="size-4" />, count: feedPosts.length },
    { key: "thread", label: "Thread", icon: <MessagesSquare className="size-4" />, count: threadPosts.length },
    { key: "articles", label: "Articles", icon: <Newspaper className="size-4" />, count: articles.length },
  ]

  // The active tab lives in the URL (?tab=…) so opening an item and coming back
  // reopens the same tab rather than resetting to Posts.
  //
  // The previous hand-rolled version rebuilt the URL as `pathname?tab=key`, which
  // silently DROPPED every other query param on the profile, and passed `null` to
  // replaceState, wiping the Next.js router state stored on the entry. The shared
  // hook edits a copy of the existing params and merges into the existing state.
  const [tab, selectTab] = useUrlState<TabKey>("tab", "posts", {
    valid: TAB_KEYS,
    // "anonymous" was the old key for what is now "Thread"; keep already-shared
    // links working instead of bouncing them to Posts.
    alias: { anonymous: "thread" },
  })
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

      {/* Content with a smooth fade/slide transition between tabs. */}
      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-300 pt-4">
        {tab === "articles" ? (
          articles.length === 0 ? (
            <EmptyState
              icon={<Newspaper className="size-6" />}
              title={homeName ? `No articles in ${homeName}` : "No articles yet"}
              message={
                isSelf
                  ? `Long-form articles you publish${inScope} will appear here.`
                  : `${name} hasn't published any articles${inScope} yet.`
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
              title={homeName ? `No threads in ${homeName}` : "No threads yet"}
              message={
                isSelf
                  ? `Questions and prayers you share on Community${inScope} appear here as a timeline.`
                  : `${name} hasn't shared anything on Community${inScope} yet.`
              }
              action={
                isSelf ? (
                  <Link
                    href="/chatrooms?room=community"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  >
                    <Plus className="size-4" /> Post to Community
                  </Link>
                ) : null
              }
            />
          ) : (
            /* Same component the Community room and the organisation profile's
               Thread tab use, so tap-to-expand, the comment sheet, media full
               screen and swiping between clips behave identically on all three.
               This replaced <ProfileThreads>, whose card only looked like a
               Community post but navigated away to /chatrooms/community?q=<id>,
               losing the reader's place on the profile. */
            <CommunityThreadFeed posts={threadPosts} />
          )
        ) : tab === "posts" ? (
          feedPosts.length === 0 ? (
            <EmptyState
              icon={<LayoutGrid className="size-6" />}
              title={homeName ? `No posts in ${homeName}` : "No posts yet"}
              message={
                isSelf
                  ? `Posts you share on the main feed${inScope} will show up here.`
                  : `${name} hasn't posted to the feed${inScope} yet.`
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
