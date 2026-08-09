"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Clock, Loader2, PenLine, Search, Sparkles, X } from "lucide-react"
import type { ArticleCard } from "@/lib/article-types"
import { getArticleFeed } from "@/app/actions/articles"
import { ArticleRow, FeaturedArticleCard } from "@/components/articles/article-card"
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
  // Collapse the Write FAB to an icon while scrolling down so it never blocks
  // article content; expand it again at rest / when scrolling up.
  const [fabExpanded, setFabExpanded] = useState(true)
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

  // Collapse/expand the Write FAB based on scroll direction.
  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        if (y < 80) setFabExpanded(true)
        else if (y > lastY + 6) setFabExpanded(false)
        else if (y < lastY - 6) setFabExpanded(true)
        lastY = y
        ticking = false
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

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
      {/* Search — refined surface with a soft focus ring; the My Articles
          control sits beside it as a quiet ghost button so it never competes. */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="group relative flex-1 rounded-xl bg-secondary/30 ring-1 ring-inset ring-border/50 transition-shadow duration-200 focus-within:ring-primary/50 focus-within:ring-offset-0 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_12%,transparent)]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles"
            className="w-full rounded-xl bg-transparent py-2.5 pl-10 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Link
          href="/articles/mine"
          aria-label="My articles"
          className="tap-scale flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          <PenLine className="size-[18px]" />
        </Link>
      </div>

      {/* Category navigation — editorial section nav with a thin orange
          underline for the active section rather than a filled pill. */}
      <nav
        data-scroll
        aria-label="Article categories"
        className="hscroll -mx-4 mb-6 flex items-center gap-6 overflow-x-auto border-b border-border/40 px-4 sm:mx-0 sm:px-0"
      >
        {["All", ...categories].map((c) => {
          const active = category === c
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "relative shrink-0 whitespace-nowrap pb-2.5 pt-1 text-sm transition-colors duration-200",
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground/70 hover:text-foreground",
              )}
            >
              {c}
              <span
                className={cn(
                  "absolute inset-x-0 -bottom-px h-0.5 origin-center rounded-full bg-primary transition-all duration-300 ease-out",
                  active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                )}
                aria-hidden
              />
            </button>
          )
        })}
      </nav>

      {/* Featured article */}
      {showFeatured && (
        <section className="mb-9 animate-in fade-in duration-500">
          <FeaturedArticleCard article={featured} />
        </section>
      )}

      {/* Editor's Pick rail — curated standout articles */}
      {isDefaultView && editorsPicks.length > 0 && (
        <section className="mb-9">
          <div className="mb-4 flex items-baseline gap-2.5">
            <Sparkles className="size-4 shrink-0 translate-y-0.5 text-primary" />
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Editor&apos;s Pick</h2>
            <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
              Curated
            </span>
          </div>
          <div data-scroll className="hscroll -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {editorsPicks.map((a) => (
              <EditorsPickCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {/* Feed — an editorial collection separated by hairline dividers. */}
      <section>
        {isDefaultView && (
          <h2 className="mb-1 font-display text-lg font-semibold tracking-tight text-foreground">Latest articles</h2>
        )}
        {items.length === 0 && !loading ? (
          <EmptyState search={debounced} />
        ) : (
          <div className="flex flex-col divide-y divide-border/40">
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

      {/* Write FAB — collapses to an icon on scroll-down. */}
      <Link
        href="/articles/write"
        aria-label="Write an article"
        className={cn(
          "tap-scale fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-30 flex items-center rounded-full bg-primary py-3.5 font-semibold text-primary-foreground shadow-floating transition-all duration-300 ease-out sm:right-6",
          fabExpanded ? "gap-2 pl-4 pr-5" : "gap-0 px-3.5",
        )}
      >
        <PenLine className="size-5 shrink-0" />
        <span
          className={cn(
            "overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
            fabExpanded ? "max-w-20 opacity-100" : "max-w-0 opacity-0",
          )}
        >
          Write
        </span>
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
      className="tap-scale group relative flex aspect-[3/4] w-40 shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-card shadow-elevated sm:w-44"
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
      {/* Deep scrim keeps the title readable even over busy promo artwork. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/5" />
      <div className="relative p-3.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
          {article.category}
        </span>
        <h3 className="mt-1 line-clamp-3 text-pretty font-display text-sm font-semibold leading-snug text-white">
          {article.title}
        </h3>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-white/60">
          <Clock className="size-2.5" />
          {article.readMinutes} min
        </div>
      </div>
    </Link>
  )
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center animate-in fade-in duration-500">
      <span className="relative mb-4 flex size-14 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-full bg-primary/5 blur-md" />
        <span className="relative flex size-14 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground/80 ring-1 ring-border/40">
          <PenLine className="size-6" />
        </span>
      </span>
      <p className="font-display text-base font-semibold tracking-tight text-foreground">No articles here yet</p>
      <p className="mt-1.5 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
        {search
          ? `Nothing matches “${search}”. Try a different search or category.`
          : "New teaching, insights and stories will appear here."}
      </p>
      {!search && (
        <Link
          href="/articles/write"
          className="tap-scale mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          <PenLine className="size-4" />
          Write an article
        </Link>
      )}
    </div>
  )
}
