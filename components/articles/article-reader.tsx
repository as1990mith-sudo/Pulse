"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Bookmark,
  Eye,
  Heart,
  MessageCircle,
  Pencil,
  Share2,
} from "lucide-react"
import type { ArticleCard, ArticleCommentView, ArticleDetail } from "@/lib/article-types"
import type { CurrentUser } from "@/lib/session"
import { recordArticleView, setArticleLike } from "@/app/actions/articles"
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
  const [, startTransition] = useTransition()

  const commentCount = countComments(comments)

  // Count a read once per mount (server dedupes rapid re-counts per viewer).
  useEffect(() => {
    void recordArticleView(article.id)
  }, [article.id])

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

      {/* Category + title */}
      <div className="mt-5">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {article.category}
        </span>
        <h1 className="mt-2 text-balance font-display text-3xl font-bold leading-tight text-foreground">
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

      {/* Cover */}
      {article.coverUrl && (
        <div className="mt-6 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverUrl || "/placeholder.svg"}
            alt=""
            className="w-full object-cover"
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
