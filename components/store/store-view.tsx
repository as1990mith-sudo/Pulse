"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Plus, Search, ShoppingCart, Store } from "lucide-react"
import { BOOK_CATEGORIES, type Book, type StoreCategory } from "@/lib/store-data"
import { BookGridCard } from "@/components/store/store-cards"
import { useStoreState } from "@/lib/use-store-state"
import { cn } from "@/lib/utils"

const PAGE = 12

export function StoreView({ books }: { books: Book[] }) {
  const [category, setCategory] = useState<StoreCategory | "All">("All")

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 sm:px-6">
      <SearchBar />
      <CategoryPills categories={BOOK_CATEGORIES} active={category} onChange={setCategory} />
      <BooksGrid books={books} category={category} />
    </div>
  )
}

function SearchBar() {
  // Live cart size so the store's cart icon mirrors the badge that used to live
  // in the app drawer.
  const { cartCount } = useStoreState()
  const cartItems = cartCount()

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Link
          href="/search"
          className="flex flex-1 items-center gap-2.5 rounded-2xl border border-border/60 bg-secondary/40 px-3.5 py-2.5 text-muted-foreground shadow-soft backdrop-blur-md transition-colors hover:bg-secondary/70"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate text-sm">Search books</span>
        </Link>
        <Link
          href="/store/publish"
          className="tap-scale flex shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated"
        >
          <Plus className="size-4" />
          Sell
        </Link>
        <Link
          href="/store/listings"
          aria-label="Your listings"
          className="tap-scale flex size-[42px] shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-secondary/40 text-muted-foreground shadow-soft transition-colors hover:text-foreground"
        >
          <Store className="size-4" />
        </Link>
        <Link
          href="/cart"
          aria-label={cartItems > 0 ? `Cart, ${cartItems} items` : "Cart"}
          className="tap-scale relative flex size-[42px] shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-secondary/40 text-muted-foreground shadow-soft transition-colors hover:text-foreground"
        >
          <ShoppingCart className="size-4" />
          {cartItems > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-foreground">
              {cartItems > 99 ? "99+" : cartItems}
            </span>
          )}
        </Link>
      </div>
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
    <div data-scroll className="hscroll -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {all.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
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

function BooksGrid({ books, category }: { books: Book[]; category: StoreCategory | "All" }) {
  const filtered = useMemo(
    () => (category === "All" ? books : books.filter((b) => b.category === category)),
    [books, category],
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

  if (filtered.length === 0) {
    return <EmptyState label="No books published yet. Be the first to sell one." />
  }

  return (
    <section>
      <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
        {filtered.slice(0, visible).map((b, i) => (
          <BookGridCard key={b.id} book={b} index={i} />
        ))}
      </div>
      {visible < filtered.length && <div ref={sentinel} className="h-10" aria-hidden />}
    </section>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 px-6 py-14 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
