"use client"

import Link from "next/link"
import { Library as LibraryIcon, ShoppingBag } from "lucide-react"
import type { Book } from "@/lib/store-data"
import { BookGridCard } from "@/components/store/store-cards"

// `courses` is accepted but ignored — the library is books-only now that courses
// were removed from the store. Keeping the optional prop avoids touching the
// page's data fetch.
export function LibraryView({ books }: { books: Book[]; courses?: unknown }) {
  const total = books.length

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <LibraryIcon className="size-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Your Library</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total} book${total === 1 ? "" : "s"} you own` : "Books you own live here"}
          </p>
        </div>
      </header>

      {total === 0 ? (
        <EmptyLibrary />
      ) : (
        // Same principle as the Book Store: a compact 3-column grid with
        // one-line titles.
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
          {books.map((b, i) => (
            <BookGridCard key={b.id} book={b} index={i} href={`/library/book/${b.id}`} />
          ))}
        </div>
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
        Books you purchase from the Store will appear here for reading.
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
