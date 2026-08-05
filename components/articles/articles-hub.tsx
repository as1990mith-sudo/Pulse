"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Clock, Loader2, PenLine, Search, Sparkles, X } from "lucide-react"
import type { ArticleCard } from "@/lib/article-types"
import { getArticleFeed } from "@/app/actions/articles"
import { ArticleRow, FeaturedArticleCard } from "@/components/articles/article-card"
import { AuthorAvatar } from "@/components/articles/author-avatar"
import { cn } from "@/lib/utils"

const PAGE = 12

export function ArticlesHub({
  featured,
  editorsPicks,
  initialFeed,
  initialNextOffset,
  categories,
}: {
  featured: ArticleCard | null
  editorsPicks: ArticleCard[]
  initialFeed: ArticleCard[]
  initialNextOffset: number | null
  categories: string[]
}) {
  const [category, setCategory] = useState<string>("All")
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")

  const [items, setItems] = useState<ArticleCard[]>(initialFeed)
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset)
  const [loading, setLoading] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // Identifies the current query so out-of-order responses are ignored.
  const queryRef = useRef(0)

  const isDefaultView = category === "All" && debounced.trim() === ""

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const runQuery = useCallback(
    async (offset: number, replace: boolean) => {
      const token = ++queryRef.current
      setLoading(true)
      try {
        const res = await getArticleFeed({
          category: category === "All" ? undefined : category,
          search: debounced.trim() || undefined,
          offset,
          limit: PAGE,
          // The featured hero only shows in the default view, so only exclude it
          // there — search/category results should still be able to surface it.
          excludeId: isDefaultView ? (featured?.id ?? undefined) : undefined,
        })
        if (token !== queryRef.current) return
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]))
        setNextOffset(res.nextOffset)
      } finally {
        if (token === queryRef.current) setLoading(false)
      }
    },
    [category, debounced, isDefaultView, featured?.id],
  )

  // Refetch from the top whenever the filter or search changes. Skip the very
  // first render for the default view — it's already server-rendered.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      if (isDefaultView) return
    }
    runQuery(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, debounced])

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current
    if (!el || nextOffset == null) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && nextOffset != null) runQuery(nextOffset, false)
      },
      { rootMargin: "600px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [nextOffset, loading, runQuery])

  const showFeatured = isDefaultView && featured

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6">
      {/* Search */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles"
            className="w-full rounded-2xl border border-border/60 bg-secondary/40 py-2.5 pl-10 pr-9 text-sm text-foreground shadow-soft outline-none backdrop-blur-md transition-colors placeholder:text-muted-foreground focus:border-primary/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Link
          href="/articles/mine"
          className="tap-scale flex shrink-0 items-center gap-1.5 rounded-2xl border border-border/60 bg-secondary/40 px-3.5 py-2.5 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-secondary/70"
        >
          <PenLine className="size-4" />
          <span className="hidden sm:inline">My Articles</span>
        </Link>
      </div>

      {/* Category chips */}
      <div data-scroll className="hscroll -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              category === c
                ? "border-primary bg-primary text-primary-foreground shadow-soft"
                : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Featured article */}
      {showFeatured && (
        <section className="mb-6">
          <FeaturedArticleCard article={featured} />
        </section>
      )}

      {/* Editor's Pick rail — curated standout articles */}
      {isDefaultView && editorsPicks.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Sparkles className="size-3.5" />
            </span>
            <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">Editor&apos;s Pick</h2>
            <span className="ml-auto text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Curated
            </span>
          </div>
          <div data-scroll className="hscroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {editorsPicks.map((a) => (
              <EditorsPickCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {/* Feed */}
      <section>
        {isDefaultView && <h2 className="mb-3 text-sm font-semibold text-foreground">Latest articles</h2>}
        {items.length === 0 && !loading ? (
          <EmptyState search={debounced} />
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
          </div>
        )}
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {nextOffset != null && <div ref={sentinel} className="h-10" aria-hidden />}
      </section>

      {/* Write FAB */}
      <Link
        href="/articles/write"
        aria-label="Write an article"
        className="tap-scale fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-floating sm:right-6"
      >
        <PenLine className="size-5" />
        Write
      </Link>
    </div>
  )
}

/**
 * A compact, premium cover card for the Editor's Pick rail. Cover fills the
 * card with a bottom gradient; category, title, author and read time sit over
 * it so each pick reads at a glance without taking much vertical space.
 */
function EditorsPickCard({ article }: { article: ArticleCard }) {
  return (
    <Link
      href={`/articles/${article.id}`}
      className="tap-scale group relative flex aspect-[3/4] w-44 shrink-0 flex-col justify-end overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elevated ring-1 ring-white/5 sm:w-48"
    >
      {article.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverUrl || "/placeholder.svg"}
          alt=""
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-secondary/40 to-card" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <div className="relative p-3">
        <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
          {article.category}
        </span>
        <h3 className="mt-1.5 line-clamp-2 text-pretty font-display text-sm font-semibold leading-snug text-white">
          {article.title}
        </h3>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/80">
          <AuthorAvatar author={article.author} size={16} ring />
          <span className="max-w-20 truncate font-medium">{article.author.name}</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-0.5">
            <Clock className="size-2.5" />
            {article.readMinutes}m
          </span>
        </div>
      </div>
    </Link>
  )
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 px-6 py-14 text-center">
      <PenLine className="mb-3 size-7 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">
        {search ? `No articles match "${search}"` : "No articles published yet"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {search ? "Try a different search or category." : "Be the first to share your writing with the community."}
      </p>
      {!search && (
        <Link
          href="/articles/write"
          className="tap-scale mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          <PenLine className="size-4" />
          Write an article
        </Link>
      )}
    </div>
  )
}
