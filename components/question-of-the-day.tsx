"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowLeft, History, Lightbulb, MessageSquare, PenLine } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { CommentSheet } from "@/components/comment-sheet"
import { MarqueeTitle } from "@/components/marquee-title"
import { type ThreadComment } from "@/components/comment-thread"
import {
  createPost,
  deletePost,
  editPost,
  getChannelFeed,
  setPostLike,
  type FeedPostView,
} from "@/app/actions/feed"
import { qotdChannel, type QotdQuestionRow } from "@/lib/qotd-types"
import { useAutoHideChatChrome } from "@/lib/chat-chrome"
import type { CurrentUser } from "@/lib/session"

/**
 * A Question-of-the-Day response is stored as a channel feed post, but the UI
 * presents each one as a flat top-level comment (no sub-threads, no media) so
 * the surface reads like the feed's comment section rather than a wall of
 * independent posts.
 */
function responseToThreadComment(p: FeedPostView): ThreadComment {
  return {
    id: p.id,
    parentId: null,
    authorId: p.authorId,
    isSelf: p.isSelf,
    name: p.user,
    handle: p.handle,
    initials: p.initials,
    color: p.color,
    image: p.authorImage,
    text: p.text,
    likes: p.likes,
    liked: p.liked,
    edited: p.edited,
    postedAt: p.postedAt,
    createdAtMs: p.createdAtMs,
  }
}

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
  const [sheetOpen, setSheetOpen] = useState(false)
  const onFeedScroll = useAutoHideChatChrome()
  const channel = question ? qotdChannel(question.id) : null

  const { data: responses = initialResponses, mutate } = useSWR(
    channel ? ["qotd-responses", channel] : null,
    () => getChannelFeed(channel as string),
    { fallbackData: initialResponses, refreshInterval: 20000 },
  )

  // Post a new response to the QOTD channel, then refresh the list.
  async function handleSubmit(text: string) {
    if (!channel) return
    await createPost({ text, channel })
    await mutate()
  }

  // Like/unlike a response with an optimistic list update.
  async function handleLike(id: number, liked: boolean) {
    await mutate(
      (cur = responses) => cur.map((p) => (p.id === id ? { ...p, liked, likes: p.likes + (liked ? 1 : -1) } : p)),
      { revalidate: false },
    )
    try {
      await setPostLike({ postId: id, liked })
    } catch {
      await mutate()
    }
  }

  async function handleEdit(id: number, text: string) {
    await editPost({ postId: id, text })
    await mutate()
  }

  async function handleDelete(id: number) {
    await deletePost(id)
    await mutate()
  }

  const responseCount = responses.length
  const countLabel =
    responseCount > 0 ? `${responseCount} ${responseCount === 1 ? "response" : "responses"}` : "Responses"

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
          <MarqueeTitle text="One question · many perspectives" className="text-sm text-muted-foreground" />
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
                  // Render at the image's own aspect ratio (1:1 or 4:5 from the
                  // admin cropper) — width fills the column, height follows the
                  // upload so it's never re-cropped to 16:9.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={question.image || "/placeholder.svg"}
                    alt=""
                    className="mb-4 w-full rounded-2xl border border-border/60"
                  />
                )}
                <h2 className="text-balance text-base leading-relaxed">{question.questionText}</h2>
              </div>
            </section>

            {/* Responses — opens the comment-section sheet (like the feed). */}
            <section className="mx-auto max-w-2xl px-4 sm:px-6">
              {responseCount === 0 ? (
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 px-6 py-12 text-center transition-colors hover:bg-secondary/40"
                >
                  <MessageSquare className="size-6 text-muted-foreground" />
                  <span className="font-semibold">Be the first to respond</span>
                  <span className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                    Tap to open the conversation and share your perspective.
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/60 px-4 py-4 text-left transition-colors hover:bg-secondary/40"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    {countLabel}
                  </span>
                  <span className="text-sm font-medium text-primary">View</span>
                </button>
              )}
            </section>
          </>
        )}
      </div>

      {/* Floating respond button */}
      {question && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-5 z-30 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-base font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-8"
        >
          <PenLine className="size-5" />
          Respond
        </button>
      )}

      {/* Comment-section sheet: flat, text-only responses at 85% screen height. */}
      {question && channel && (
        <CommentSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={countLabel}
          count={responseCount}
          comments={responses.map(responseToThreadComment)}
          currentUser={currentUser}
          onSubmit={handleSubmit}
          onLike={handleLike}
          onEdit={handleEdit}
          onDelete={handleDelete}
          allowReply={false}
          enforceTimeWindows={false}
          heightClassName="h-[85%]"
          placeholder="What are your thoughts on today's question?"
          emptyText="No responses yet"
          emptyHint="Be the first to share your perspective."
        />
      )}
    </div>
  )
}
