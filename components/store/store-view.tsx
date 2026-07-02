"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, Search, Sparkles } from "lucide-react"
import {
  BOOKS,
  COURSES,
  BOOK_CATEGORIES,
  COURSE_CATEGORIES,
  booksByTag,
  coursesByTag,
  type StoreCategory,
} from "@/lib/store-data"
import { BookGridCard, BookRailCard, CourseGridCard, CourseRailCard } from "@/components/store/store-cards"
import { cn } from "@/lib/utils"

type Tab = "books" | "courses"

export function StoreView() {
  const [tab, setTab] = useState<Tab>("books")
  const [category, setCategory] = useState<StoreCategory | "All">("All")

  // Reset category when switching tabs so filters never carry across types.
  function switchTab(next: Tab) {
    if (next === tab) return
    setTab(next)
    setCategory("All")
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 sm:px-6">
      <StoreHero />

      <SearchBar />

      <TabBar tab={tab} onChange={switchTab} />

      <CategoryPills
        categories={tab === "books" ? BOOK_CATEGORIES : COURSE_CATEGORIES}
        active={category}
        onChange={setCategory}
      />

      {tab === "books" ? <BooksTab category={category} /> : <CoursesTab category={category} />}
    </div>
  )
}

function StoreHero() {
  const featured = booksByTag("featured")[0] ?? BOOKS[0]
  return (
    <Link
      href={`/store/book/${featured.id}`}
      className="group relative mb-5 block aspect-[16/9] w-full overflow-hidden rounded-[2rem] border border-border/60 shadow-floating sm:aspect-[21/9]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/store/hero-featured.png"
        alt=""
        className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end gap-2 p-5 sm:p-8">
        <span className="flex w-fit items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-primary-foreground">
          <Sparkles className="size-3.5" />
          Editor&apos;s Pick
        </span>
        <h2 className="max-w-md text-balance font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
          {featured.title}
        </h2>
        <p className="max-w-sm text-pretty text-sm text-white/80">{featured.subtitle}</p>
        <span className="mt-1 flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-white/25">
          Explore now
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

function SearchBar() {
  return (
    <Link
      href="/search"
      className="mb-5 flex items-center gap-3 rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3 text-muted-foreground shadow-soft backdrop-blur-md transition-colors hover:bg-secondary/70"
    >
      <Search className="size-5 shrink-0" />
      <span className="text-sm">Search books, courses, authors…</span>
    </Link>
  )
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="relative mb-4 flex border-b border-border/60">
      {(["books", "courses"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-current={tab === t ? "true" : undefined}
          className={cn(
            "relative flex-1 pb-3 pt-1 text-center text-sm font-semibold capitalize transition-colors",
            tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t}
        </button>
      ))}
      {/* Sliding underline indicator: half-width, translated by its own width so
          it sits perfectly under whichever equal-width tab is active. */}
      <span
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-1/2 rounded-full bg-primary transition-transform duration-300 ease-out"
        style={{ transform: tab === "books" ? "translateX(0%)" : "translateX(100%)" }}
        aria-hidden
      />
    </div>
  )
}

function CategoryPills({
  categories,
  active,
  onChange,
}: {
  categories: StoreCategory[]
  active: StoreCategory | "All"
  onChange: (c: StoreCategory | "All") => void
}) {
  const all: (StoreCategory | "All")[] = ["All", ...categories]
  return (
    <div data-scroll className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {all.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
            active === c
              ? "border-primary bg-primary text-primary-foreground shadow-soft"
              : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground",
          )}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

function SectionRail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <div data-scroll className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {children}
      </div>
    </section>
  )
}

const PAGE = 9

function BooksTab({ category }: { category: StoreCategory | "All" }) {
  const filtered = useMemo(
    () => (category === "All" ? BOOKS : BOOKS.filter((b) => b.category === category)),
    [category],
  )
  const [visible, setVisible] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  // Reset paging whenever the filter changes.
  useEffect(() => setVisible(PAGE), [category])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible((v) => Math.min(v + PAGE, filtered.length))
      },
      { rootMargin: "600px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])

  return (
    <div>
      {category === "All" && (
        <SectionRail title="Trending now">
          {booksByTag("trending").map((b) => (
            <BookRailCard key={b.id} book={b} />
          ))}
        </SectionRail>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          {category === "All" ? "All books" : category}
        </h2>
        {filtered.length === 0 ? (
          <EmptyState label="No books in this category yet." />
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
            {filtered.slice(0, visible).map((b, i) => (
              <BookGridCard key={b.id} book={b} index={i} />
            ))}
          </div>
        )}
        {visible < filtered.length && <div ref={sentinel} className="h-10" aria-hidden />}
      </section>
    </div>
  )
}

function CoursesTab({ category }: { category: StoreCategory | "All" }) {
  const filtered = useMemo(
    () => (category === "All" ? COURSES : COURSES.filter((c) => c.category === category)),
    [category],
  )

  return (
    <div>
      {category === "All" && coursesByTag("trending").length > 0 && (
        <SectionRail title="Trending now">
          {coursesByTag("trending").map((c) => (
            <CourseRailCard key={c.id} course={c} />
          ))}
        </SectionRail>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          {category === "All" ? "All courses" : category}
        </h2>
        {filtered.length === 0 ? (
          <EmptyState label="No courses in this category yet." />
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
            {filtered.map((c, i) => (
              <CourseGridCard key={c.id} course={c} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 px-6 py-14 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
