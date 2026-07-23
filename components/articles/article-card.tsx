import Link from "next/link"
import { Clock, Heart, MessageCircle } from "lucide-react"
import type { ArticleCard as ArticleCardType } from "@/lib/article-types"
import { cn } from "@/lib/utils"
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

/** A horizontal article row for the hub feed + search results. */
export function ArticleRow({ article }: { article: ArticleCardType }) {
  return (
    <Link
      href={`/articles/${article.id}`}
      className="tap-scale group flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-elevated ring-1 ring-white/5 transition-colors hover:border-primary/40 hover:bg-secondary/40 sm:gap-4 sm:p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            {article.category}
          </span>
        </div>
        <h3 className="line-clamp-2 text-pretty font-display text-[15px] font-semibold leading-snug text-foreground group-hover:text-primary">
          {article.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{article.excerpt}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <AuthorAvatar author={article.author} size={18} />
            <span className="max-w-28 truncate font-medium text-foreground/80">{article.author.name}</span>
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {article.readMinutes}m
          </span>
          <span className="flex items-center gap-1">
            <Heart className="size-3" />
            {compact(article.likeCount)}
          </span>
        </div>
      </div>
      {article.coverUrl ? (
        <div className="relative shrink-0 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverUrl || "/placeholder.svg"}
            alt=""
            className="size-20 object-cover sm:size-24"
          />
        </div>
      ) : null}
    </Link>
  )
}

/** A large, hero-style card for the hub's featured article. */
export function FeaturedArticleCard({ article }: { article: ArticleCardType }) {
  return (
    <Link
      href={`/articles/${article.id}`}
      className="tap-scale group relative block overflow-hidden rounded-3xl border border-border/50 bg-card shadow-elevated"
    >
      {article.coverUrl ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-[16/8]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverUrl || "/placeholder.svg"}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        </div>
      ) : (
        <div className="aspect-[16/9] w-full bg-gradient-to-br from-primary/25 via-card to-card" />
      )}
      <div className={cn("p-4 sm:p-5", article.coverUrl && "absolute inset-x-0 bottom-0")}>
        <span className="inline-flex rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
          Featured
        </span>
        <h2
          className={cn(
            "mt-2 text-pretty font-display text-xl font-bold leading-tight sm:text-2xl",
            article.coverUrl ? "text-white" : "text-foreground",
          )}
        >
          {article.title}
        </h2>
        <div
          className={cn(
            "mt-2.5 flex items-center gap-2 text-[13px]",
            article.coverUrl ? "text-white/85" : "text-muted-foreground",
          )}
        >
          <AuthorAvatar author={article.author} size={22} ring={!!article.coverUrl} />
          <span className="font-medium">{article.author.name}</span>
          <span aria-hidden>·</span>
          <span>{article.readMinutes} min read</span>
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
        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">{article.category}</span>
        <h3 className="mt-1 line-clamp-2 text-pretty font-display text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
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
