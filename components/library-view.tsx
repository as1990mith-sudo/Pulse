"use client"

import { useState } from "react"
import Link from "next/link"
import { BookOpen, GraduationCap, Library as LibraryIcon, ShoppingBag } from "lucide-react"
import type { Book, Course } from "@/lib/store-data"
import { BookGridCard, CourseCard } from "@/components/store/store-cards"
import { cn } from "@/lib/utils"

type Filter = "all" | "books" | "courses"

export function LibraryView({ books, courses }: { books: Book[]; courses: Course[] }) {
  const [filter, setFilter] = useState<Filter>("all")

  const total = books.length + courses.length
  const showBooks = filter !== "courses" && books.length > 0
  const showCourses = filter !== "books" && courses.length > 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <LibraryIcon className="size-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Your Library</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total} item${total === 1 ? "" : "s"} you own` : "Books & courses you own live here"}
          </p>
        </div>
      </header>

      {total === 0 ? (
        <EmptyLibrary />
      ) : (
        <>
          <div className="mb-6 flex gap-2">
            {(
              [
                { key: "all", label: "All" },
                { key: "books", label: "Books" },
                { key: "courses", label: "Courses" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  filter === t.key
                    ? "border-primary bg-primary text-primary-foreground shadow-soft"
                    : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {showCourses && (
            <section className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                <GraduationCap className="size-5 text-primary" />
                Courses
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {courses.map((c) => (
                  <CourseCard key={c.id} course={c} href={`/library/course/${c.id}`} />
                ))}
              </div>
            </section>
          )}

          {showBooks && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                <BookOpen className="size-5 text-primary" />
                Books
              </h2>
              <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                {books.map((b, i) => (
                  <BookGridCard key={b.id} book={b} index={i} href={`/library/book/${b.id}`} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 px-6 py-20 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <LibraryIcon className="size-8" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">Your library is empty</h2>
      <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
        Books and courses you purchase from the Store will appear here for reading and learning.
      </p>
      <Link
        href="/store"
        className="mt-5 flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98]"
      >
        <ShoppingBag className="size-4" />
        Browse the Store
      </Link>
    </div>
  )
}
