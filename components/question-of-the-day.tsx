"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowLeft, History, Lightbulb, MessageSquare, PenLine } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ChannelComposer } from "@/components/channel-composer"
import { PostCard } from "@/components/mind-feed"
import { getChannelFeed, type FeedPostView } from "@/app/actions/feed"
import { qotdChannel, type QotdQuestionRow } from "@/lib/qotd-types"
import { useAutoHideChatChrome } from "@/lib/chat-chrome"
import type { CurrentUser } from "@/lib/session"

export function QuestionOfTheDay({
  question,
  initialResponses,
  currentUser,
  archiveCount,
}: {
  question: QotdQuestionRow | null
  initialResponses: FeedPostView[]
  currentUser: CurrentUser
  archiveCount: number
}) {
  const [composerOpen, setComposerOpen] = useState(false)
  const onFeedScroll = useAutoHideChatChrome()
  const channel = question ? qotdChannel(question.id) : null

  const { data: responses = initialResponses, mutate } = useSWR(
    channel ? ["qotd-responses", channel] : null,
    () => getChannelFeed(channel as string),
    { fallbackData: initialResponses, refreshInterval: 20000 },
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
        <Avatar className="size-9 ring-2 ring-amber-500/30">
          <AvatarFallback className="bg-amber-600 text-white">
            <Lightbulb className="size-5" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">Question of the Day</h1>
          <p className="truncate text-sm text-muted-foreground">One question · many perspectives</p>
        </div>
        <Link
          href="/chatrooms/questions/archive"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
        >
          <History className="size-4" />
          <span className="hidden sm:inline">Previous</span>
          {archiveCount > 0 && <span className="tabular-nums text-muted-foreground">{archiveCount}</span>}
        </Link>
      </header>

      <div onScroll={onFeedScroll} className="flex-1 overflow-y-auto scroll-smooth overscroll-contain">
        {!question ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <Avatar className="size-16 ring-2 ring-amber-500/30">
              <AvatarFallback className="bg-amber-600 text-white">
                <Lightbulb className="size-7" />
              </AvatarFallback>
            </Avatar>
            <p className="text-lg font-semibold">No question yet today</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Check back soon — a new Question of the Day will appear here for the whole community to discuss.
            </p>
            {archiveCount > 0 && (
              <Button variant="secondary" className="mt-2 gap-2 rounded-full" render={<Link href="/chatrooms/questions/archive" />} nativeButton={false}>
                <History className="size-4" /> Browse previous questions
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Featured question card */}
            <section className="border-b border-border/60 bg-gradient-to-b from-amber-500/5 to-background px-4 py-6 sm:px-6">
              <div className="mx-auto max-w-2xl">
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <Lightbulb className="size-3.5" /> Today · {question.activeDate}
                </p>
                {question.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={question.image || "/placeholder.svg"}
                    alt=""
                    className="mb-4 aspect-video w-full rounded-2xl border border-border/60 object-cover"
                  />
                )}
                <h2 className="text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  {question.questionText}
                </h2>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                  Share your perspective and read how others in the community see it. Every voice adds something.
                </p>
                <Button onClick={() => setComposerOpen(true)} className="mt-4 gap-2 rounded-full">
                  <PenLine className="size-4" /> Share your response
                </Button>
              </div>
            </section>

            {/* Responses */}
            <section className="mx-auto max-w-2xl">
              <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-muted-foreground sm:px-6">
                <MessageSquare className="size-4" />
                {responses.length > 0
                  ? `${responses.length} ${responses.length === 1 ? "response" : "responses"}`
                  : "Responses"}
              </div>
              {responses.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                  <p className="font-semibold">Be the first to respond</p>
                  <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                    Tap &ldquo;Share your response&rdquo; to start the conversation.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60 border-t border-border/60 pb-28">
                  {responses.map((post) => (
                    <li key={post.id}>
                      <PostCard post={post} currentUser={currentUser} variant="feed" videoFeedPosts={responses} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {/* Floating respond button */}
      {question && (
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-5 z-30 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-base font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-8"
        >
          <PenLine className="size-5" />
          Respond
        </button>
      )}

      {question && channel && (
        <ChannelComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          onCreated={() => mutate()}
          channel={channel}
          currentUser={currentUser}
          title="Your response"
          placeholder="What are your thoughts on today's question?"
          submitLabel="Post response"
          accent="amber"
        />
      )}
    </div>
  )
}
