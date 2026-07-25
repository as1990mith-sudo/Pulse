"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowLeft, Flame, PenLine } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ChannelComposer } from "@/components/channel-composer"
import { PostCard } from "@/components/mind-feed"
import { getChannelFeed, type FeedPostView } from "@/app/actions/feed"
import { useAutoHideChatChrome } from "@/lib/chat-chrome"
import type { CurrentUser } from "@/lib/session"

const ITESTIFY_CHANNEL = "itestify"
// Testimonies can include a video up to 10 minutes long.
const MAX_VIDEO_SECONDS = 10 * 60

export function ITestify({
  initialPosts,
  currentUser,
}: {
  initialPosts: FeedPostView[]
  currentUser: CurrentUser
}) {
  const [composerOpen, setComposerOpen] = useState(false)
  const onFeedScroll = useAutoHideChatChrome()

  const { data: posts = initialPosts, mutate } = useSWR(
    ["itestify-feed", ITESTIFY_CHANNEL],
    () => getChannelFeed(ITESTIFY_CHANNEL),
    { fallbackData: initialPosts, refreshInterval: 20000 },
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky header */}
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link
          href="/chatrooms"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Back to chatrooms"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Avatar className="size-9 ring-2 ring-rose-500/30">
          <AvatarFallback className="bg-rose-600 text-white">
            <Flame className="size-5" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">iTestify</h1>
          <p className="truncate text-sm text-muted-foreground">Share what God has done</p>
        </div>
      </header>

      <div onScroll={onFeedScroll} className="flex-1 overflow-y-auto scroll-smooth overscroll-contain">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <Avatar className="size-16 ring-2 ring-rose-500/30">
              <AvatarFallback className="bg-rose-600 text-white">
                <Flame className="size-7" />
              </AvatarFallback>
            </Avatar>
            <p className="text-lg font-semibold">No testimonies yet</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Be the first to share what God has done in your life — with words, photos, or a video.
            </p>
            <Button onClick={() => setComposerOpen(true)} className="mt-2 gap-2 rounded-full">
              <PenLine className="size-4" /> Share your testimony
            </Button>
          </div>
        ) : (
          <ul className="mx-auto max-w-2xl divide-y divide-border/60 pb-28">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} currentUser={currentUser} variant="feed" videoFeedPosts={posts} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Floating share button */}
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-5 z-30 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-base font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-8"
      >
        <Flame className="size-5" />
        Testify
      </button>

      <ChannelComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={() => mutate()}
        channel={ITESTIFY_CHANNEL}
        currentUser={currentUser}
        title="Your testimony"
        placeholder="Share what God has done — testimonies that build faith…"
        submitLabel="Share testimony"
        accent="rose"
        maxVideoSeconds={MAX_VIDEO_SECONDS}
      />
    </div>
  )
}
