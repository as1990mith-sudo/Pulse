"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Bookmark,
  Eye,
  Heart,
  MessageCircle,
  Pencil,
  RotateCcw,
  Share2,
} from "lucide-react"
import type { ArticleCard, ArticleCommentView, ArticleDetail } from "@/lib/article-types"
import type { CurrentUser } from "@/lib/session"
import { recordArticleView, saveReadingProgress, setArticleLike } from "@/app/actions/articles"
import { ArticleComments, countComments } from "@/components/articles/article-comments"
import { ArticleRow } from "@/components/articles/article-card"
import { AuthorAvatar } from "@/components/articles/author-avatar"
import { WriterFollowButton } from "@/components/articles/writer-follow-button"
import { ShareSheet } from "@/components/share-sheet"
import { toggleSaveItem } from "@/app/actions/share"
import type { ShareTarget } from "@/lib/share-types"
import { cn } from "@/lib/utils"

export function ArticleReader({
  article,
  comments,
  moreFromAuthor,
  related,
  currentUser,
}: {
  article: ArticleDetail
  comments: ArticleCommentView[]
  moreFromAuthor: ArticleCard[]
  related: ArticleCard[]
  currentUser: CurrentUser | null
}) {
  const router = useRouter()
  const signedIn = Boolean(currentUser)
  const [liked, setLiked] = useState(article.liked)
  const [likes, setLikes] = useState(article.likeCount)
  const [saved, setSaved] = useState(article.saved)
  const [shareOpen, setShareOpen] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [resumed, setResumed] = useState(false)
  const resumeHandledRef = useRef(false)
  const [, startTransition] = useTransition()

  const commentCount = countComments(comments)

  // Count a read once per mount (server dedupes rapid re-counts per viewer).
  useEffect(() => {
    void recordArticleView(article.id)
  }, [article.id])

  /**
   * Reading-progress engine (signed-in only):
   *  - Tracks the furthest scroll depth and persists it (debounced, plus a final
   *    flush on hide/unmount) so the Library's Continue Reading + History stay live.
   *  - On open, jumps the reader straight back to where they previously stopped.
   */
  useEffect(() => {
    if (!signedIn) return
    let maxPercent = article.readingProgress ?? 0
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    const computePercent = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max <= 0) return 100
      return Math.round((window.scrollY / max) * 100)
    }
    const flush = () => void saveReadingProgress({ articleId: article.id, percent: maxPercent })
    const onScroll = () => {
      const p = computePercent()
      if (p > maxPercent) maxPercent = p
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(flush, 800)
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", flush)

    // Resume: scroll back to the saved position once, after layout settles.
    let restoreTimer: ReturnType<typeof setTimeout> | null = null
    const start = article.readingProgress
    if (!resumeHandledRef.current && start >= 5 && start < 90) {
      resumeHandledRef.current = true
      restoreTimer = setTimeout(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (max > 0) {
          window.scrollTo({ top: (start / 100) * max, behavior: "smooth" })
          setResumed(true)
          setTimeout(() => setResumed(false), 4500)
        }
      }, 350)
    }

    return () => {
      window.removeEventListener("scroll", onScroll)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", flush)
      if (saveTimer) clearTimeout(saveTimer)
      if (restoreTimer) clearTimeout(restoreTimer)
      flush()
    }
  }, [signedIn, article.id, article.readingProgress])

  function startOver() {
    setResumed(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function toggleLike() {
    if (!signedIn) return router.push("/login")
    const next = !liked
    setLiked(next)
    setLikes((n) => n + (next ? 1 : -1))
    startTransition(async () => {
      try {
        await setArticleLike({ id: article.id, liked: next })
      } catch {
        setLiked(!next)
        setLikes((n) => n + (next ? -1 : 1))
      }
    })
  }

  function toggleSave() {
    if (!signedIn) return router.push("/login")
    const next = !saved
    setSaved(next)
    startTransition(async () => {
      try {
        await toggleSaveItem({
          type: "article",
          key: article.id,
          title: article.title,
          subtitle: `by ${article.author.name}`,
          url: `/articles/${article.id}`,
          image: article.coverUrl,
        })
      } catch {
        setSaved(!next)
      }
    })
  }

  const shareTarget: ShareTarget = {
    type: "article",
    key: article.id,
    title: article.title,
    subtitle: `by ${article.author.name}`,
    url: `/articles/${article.id}`,
    image: article.coverUrl,
  }

  const publishedLabel = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null

  return (
    <article className="mx-auto w-full max-w-2xl px-4 pb-28 pt-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/70"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        {article.isAuthor && (
          <Link
            href={`/articles/write?id=${article.id}`}
            className="flex items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted/70"
          >
            <Pencil className="size-4" /> Edit
          </Link>
        )}
      </div>

      {/* Title */}
      <div className="mt-5">
        <h1 className="text-balance font-display text-3xl font-bold leading-tight text-foreground">
          {article.title}
        </h1>
      </div>

      {/* Author row */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <Link href={`/u/${article.author.id}`} className="flex min-w-0 items-center gap-3">
          <AuthorAvatar author={article.author} size={44} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{article.author.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {publishedLabel ? `${publishedLabel} · ` : ""}
              {article.readMinutes} min read
            </p>
          </div>
        </Link>
        {!article.isAuthor && (
          <WriterFollowButton
            writerId={article.author.id}
            initialFollowing={article.followingWriter}
            size="sm"
          />
        )}
      </div>

      {/* Cover — always shown at a consistent 16:9 frame regardless of the
          uploaded image's own aspect ratio, so tall/portrait covers don't
          dominate the article. */}
      {article.coverUrl && (
        <div className="mt-6 aspect-video w-full overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverUrl || "/placeholder.svg"}
            alt=""
            className="size-full object-cover"
          />
        </div>
      )}

      {/* Body */}
      <div
        className="article-prose mt-7"
        dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
      />

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {article.tags.map((t) => (
            <Link
              key={t}
              href={`/articles?q=${encodeURIComponent(t)}`}
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      {/* Engagement bar */}
      <div className="mt-8 flex items-center gap-2 border-y border-border py-3">
        <button
          onClick={toggleLike}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition",
            liked ? "bg-live/10 text-live" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Heart className={cn("size-5", liked && "fill-current")} />
          {likes > 0 && likes}
        </button>
        <button
          onClick={() => setShowComments(true)}
          className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
          aria-label="View comments"
        >
          <MessageCircle className="size-5" />
          {commentCount > 0 && commentCount}
        </button>
        <div className="flex items-center gap-1.5 px-2 text-sm text-muted-foreground">
          <Eye className="size-5" />
          {article.viewCount}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={toggleSave}
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition",
              saved ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
            aria-label="Save article"
          >
            <Bookmark className={cn("size-5", saved && "fill-current")} />
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
            aria-label="Share article"
          >
            <Share2 className="size-5" />
          </button>
        </div>
      </div>

      {/* More from author */}
      {moreFromAuthor.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-display text-lg font-bold text-foreground">
            More from {article.author.name}
          </h2>
          <div className="flex flex-col gap-3">
            {moreFromAuthor.map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-lg font-bold text-foreground">Related reads</h2>
          <div className="flex flex-col gap-3">
            {related.map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {/* Resume toast — confirms the jump-back and offers to start from the top. */}
      {resumed && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 duration-300 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card/95 py-2 pl-4 pr-2 text-sm shadow-elevated backdrop-blur">
            <span className="font-medium text-foreground">Picked up where you left off</span>
            <button
              onClick={startOver}
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70"
            >
              <RotateCcw className="size-3.5" />
              Start over
            </button>
          </div>
        </div>
      )}

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />

      <ArticleComments
        open={showComments}
        onClose={() => setShowComments(false)}
        articleId={article.id}
        comments={comments}
        currentUser={currentUser}
      />
    </article>
  )
}
