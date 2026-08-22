import Link from "next/link"
import { Clock, Heart, MessageCircle } from "lucide-react"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import { AuthorAvatar } from "@/components/articles/author-avatar"

function formatDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0).replace(/\.0$/, "") + "k"
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m"
}

/**
 * An editorial article row for the hub feed + search results. Borderless by
 * design — articles read as one connected collection separated by hairline
 * dividers (the parent applies `divide-y`), not isolated cards.
 */
export function ArticleRow({ article }: { article: ArticleCardType }) {
  return (
    <Link
      href={`/articles/${article.id}`}
      className="tap-scale group flex gap-4 py-5 transition-opacity active:opacity-80 sm:gap-5"
    >
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-pretty font-display text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-lg">
          {article.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{article.excerpt}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <AuthorAvatar author={article.author} size={18} />
            <span className="max-w-28 truncate font-medium text-foreground/70">{article.author.name}</span>
          </span>
          <span aria-hidden className="text-border">·</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {article.readMinutes} min
          </span>
          <span className="flex items-center gap-1">
            <Heart className="size-3" />
            {compact(article.likeCount)}
          </span>
        </div>
      </div>
      {article.coverUrl ? (
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl sm:size-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverUrl || "/placeholder.svg"}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : null}
    </Link>
  )
}

/**
 * The cinematic cover-story hero. A tall, immersive image on mobile with a
 * deep bottom-up scrim so the headline stays legible over busy artwork; the
 * only UI over the image is a small eyebrow, the title and byline.
 */
export function FeaturedArticleCard({ article }: { article: ArticleCardType }) {
  return (
    <Link
      href={`/articles/${article.id}`}
      className="tap-scale group relative flex aspect-[4/5] w-full flex-col justify-end overflow-hidden rounded-3xl bg-card shadow-elevated sm:aspect-[16/9]"
    >
      {article.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverUrl || "/placeholder.svg"}
          alt=""
          className="absolute inset-0 size-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-card to-card" />
      )}
      {/* Scrim confined to the bottom half, so the top of the artwork shows
          untinted. It fades to fully transparent at its own midpoint rather
          than ending on a visible colour, which keeps the halfway boundary from
          reading as a hard horizontal edge across the image. */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
          <span className="text-primary">Featured</span>
        </div>
        <h2 className="mt-2.5 max-w-xl text-balance font-display text-2xl font-bold leading-[1.08] text-white sm:text-[32px]">
          {article.title}
        </h2>
        <div className="mt-3.5 flex items-center gap-2 text-[13px] text-white/75">
          <AuthorAvatar author={article.author} size={24} ring />
          <span className="font-medium text-white">{article.author.name}</span>
          <span aria-hidden className="text-white/40">·</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {article.readMinutes} min read
          </span>
        </div>
      </div>
    </Link>
  )
}

/** A compact grid tile used on the writer profile portfolio. */
export function ArticleTile({ article }: { article: ArticleCardType }) {
  return (
    <Link
      href={`/articles/${article.id}`}
      className="tap-scale group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-elevated ring-1 ring-white/5 transition-colors hover:border-primary/40 hover:bg-secondary/40"
    >
      {article.coverUrl ? (
        <div className="aspect-[16/10] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.coverUrl || "/placeholder.svg"} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <div className="aspect-[16/10] w-full bg-gradient-to-br from-primary/20 via-secondary/40 to-card" />
      )}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-pretty font-display text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
          {article.title}
        </h3>
        <div className="mt-auto flex items-center gap-3 pt-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {article.readMinutes}m
          </span>
          <span className="flex items-center gap-1">
            <Heart className="size-3" />
            {compact(article.likeCount)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3" />
            {compact(article.commentCount)}
          </span>
        </div>
      </div>
    </Link>
  )
}

export { formatDate, compact }
