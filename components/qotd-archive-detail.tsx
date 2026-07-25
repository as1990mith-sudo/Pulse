"use client"

import Link from "next/link"
import { ArrowLeft, Lightbulb, MessageSquare } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PostCard } from "@/components/mind-feed"
import type { FeedPostView } from "@/app/actions/feed"
import type { QotdQuestionRow } from "@/lib/qotd-types"
import type { CurrentUser } from "@/lib/session"

export function QotdArchiveDetail({
  question,
  responses,
  currentUser,
}: {
  question: QotdQuestionRow
  responses: FeedPostView[]
  currentUser: CurrentUser
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link
          href="/chatrooms/questions/archive"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Back to previous questions"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">Previous question</h1>
          <p className="truncate text-sm text-muted-foreground">{question.activeDate}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <section className="border-b border-border/60 bg-gradient-to-b from-amber-500/5 to-background px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <Lightbulb className="size-3.5" /> {question.activeDate}
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
            <p className="mt-3 text-sm text-muted-foreground">
              This question has been archived. Its discussion is preserved below.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-2xl">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-muted-foreground sm:px-6">
            <MessageSquare className="size-4" />
            {responses.length > 0
              ? `${responses.length} ${responses.length === 1 ? "response" : "responses"}`
              : "Responses"}
          </div>
          {responses.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <Avatar className="size-14 ring-2 ring-amber-500/30">
                <AvatarFallback className="bg-amber-600 text-white">
                  <Lightbulb className="size-6" />
                </AvatarFallback>
              </Avatar>
              <p className="text-sm text-muted-foreground">This question didn&apos;t receive any responses.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60 border-t border-border/60 pb-12">
              {responses.map((post) => (
                <li key={post.id}>
                  <PostCard post={post} currentUser={currentUser} variant="feed" videoFeedPosts={responses} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
