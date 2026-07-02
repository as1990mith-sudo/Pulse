"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import { Search, X } from "lucide-react"
import { BOOKS, COURSES, BOOK_CATEGORIES } from "@/lib/store-data"
import { BookGridCard, CourseCard } from "@/components/store/store-cards"

export function SearchView() {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const q = query.trim().toLowerCase()

  const { books, courses } = useMemo(() => {
    if (!q) return { books: [], courses: [] }
    const match = (s: string) => s.toLowerCase().includes(q)
    return {
      books: BOOKS.filter((b) => match(b.title) || match(b.author) || match(b.category) || match(b.subtitle)),
      courses: COURSES.filter(
        (c) => match(c.title) || match(c.instructor) || match(c.category) || match(c.subtitle),
      ),
    }
  }, [q])

  const hasResults = books.length > 0 || courses.length > 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      {/* Search field */}
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3 shadow-soft backdrop-blur-md focus-within:border-primary/50">
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search books, courses, authors…"
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Search the store"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background/60 text-muted-foreground transition-transform active:scale-90"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!q ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Browse categories</h2>
          <div className="flex flex-wrap gap-2">
            {BOOK_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setQuery(c)}
                className="rounded-full border border-border/60 bg-secondary/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : !hasResults ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 px-6 py-20 text-center">
          <p className="text-sm text-muted-foreground">
            No results for <span className="font-medium text-foreground">“{query}”</span>
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {courses.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-foreground">Courses</h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {courses.map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
            </section>
          )}
          {books.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-foreground">Books</h2>
              <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                {books.map((b, i) => (
                  <BookGridCard key={b.id} book={b} index={i} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
