"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Loader2, PenLine, Search, UserRound, Users, X } from "lucide-react"
import type { ArticleCard, FeaturedWriter } from "@/lib/article-types"
import { getArticleFeed } from "@/app/actions/articles"
import { ArticleRow, FeaturedArticleCard } from "@/components/articles/article-card"
import { AuthorAvatar } from "@/components/articles/author-avatar"
import { WriterFollowButton } from "@/components/articles/writer-follow-button"
import { cn } from "@/lib/utils"

const PAGE = 12

export function ArticlesHub({
  featured,
  featuredWriters,
  initialFeed,
  initialNextOffset,
  categories,
}: {
  featured: ArticleCard | null
  featuredWriters: FeaturedWriter[]
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
        })
        if (token !== queryRef.current) return
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]))
        setNextOffset(res.nextOffset)
      } finally {
        if (token === queryRef.current) setLoading(false)
      }
    },
    [category, debounced],
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

      {/* Featured writers rail */}
      {isDefaultView && featuredWriters.length > 0 && (
        <section className="mb-6">
          <div className="mb-2.5 flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Featured writers</h2>
          </div>
          <div data-scroll className="hscroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {featuredWriters.map((w) => (
              <div
                key={w.author.id}
                className="flex w-36 shrink-0 flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card/60 p-3.5 text-center shadow-soft"
              >
                <AuthorAvatar author={w.author} size={52} link />
                <div className="min-w-0">
                  <Link
                    href={`/u/${w.author.id}`}
                    className="block truncate text-sm font-semibold text-foreground hover:text-primary"
                  >
                    {w.author.name}
                  </Link>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {w.articleCount} article{w.articleCount === 1 ? "" : "s"}
                  </p>
                </div>
                {w.isSelf ? (
                  <Link
                    href={`/u/${w.author.id}`}
                    className="tap-scale inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70"
                  >
                    <UserRound className="size-3.5" />
                    Profile
                  </Link>
                ) : (
                  <WriterFollowButton writerId={w.author.id} initialFollowing={w.followingWriter} size="sm" />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Featured article */}
      {showFeatured && (
        <section className="mb-6">
          <FeaturedArticleCard article={featured} />
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
