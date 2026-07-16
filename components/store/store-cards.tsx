"use client"

import Link from "next/link"
import { Heart, Star, Play, Share2 } from "lucide-react"
import type { Book, Course } from "@/lib/store-data"
import { formatPrice } from "@/lib/store-data"
import { useStoreState } from "@/lib/use-store-state"
import { cn } from "@/lib/utils"

/** Small inline star rating. */
export function Stars({ rating, count, className }: { rating: number; count?: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      {count != null && <span className="text-muted-foreground">({count > 999 ? `${(count / 1000).toFixed(1)}k` : count})</span>}
    </span>
  )
}

function WishlistButton({ id, className }: { id: string; className?: string }) {
  const { isWishlisted, toggleWishlist } = useStoreState()
  const active = isWishlisted(id)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleWishlist(id)
      }}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={active}
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-background/60 text-foreground backdrop-blur-md transition-transform active:scale-90",
        className,
      )}
    >
      <Heart className={cn("size-4 transition-colors", active ? "fill-rose-500 text-rose-500 motion-pop" : "text-foreground")} />
    </button>
  )
}

export function ShareButton({ title, className }: { title: string; className?: string }) {
  async function share(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (navigator.share) await navigator.share({ title, url })
      else await navigator.clipboard?.writeText(url)
    } catch {
      /* user cancelled */
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      aria-label="Share"
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-background/60 text-foreground backdrop-blur-md transition-transform active:scale-90",
        className,
      )}
    >
      <Share2 className="size-4" />
    </button>
  )
}

function PriceBadge({ price, className }: { price: number; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-background/80 px-2.5 py-1 text-xs font-semibold text-foreground shadow-soft backdrop-blur-md",
        className,
      )}
    >
      {formatPrice(price)}
    </span>
  )
}

/**
 * Pinterest-style grid card for the main Books grid: a premium portrait cover
 * with a floating wishlist heart and price badge, then a tiny rating, title
 * (max 2 lines) and author beneath. Fades + slides up into view on mount.
 */
export function BookGridCard({ book, index = 0, href }: { book: Book; index?: number; href?: string }) {
  return (
    <Link
      href={href ?? `/store/book/${book.id}`}
      className="group flex flex-col animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[1.25rem] border border-border/60 bg-muted shadow-elevated transition-transform duration-300 group-active:scale-[0.98]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={book.cover || "/placeholder.svg"}
          alt={`${book.title} cover`}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <WishlistButton id={book.id} className="absolute right-2 top-2" />
        <PriceBadge price={book.price} className="absolute bottom-2 left-2" />
      </div>
      <div className="mt-2 flex flex-col gap-0.5">
        <Stars rating={book.rating} />
        <h3 className="truncate text-sm font-semibold leading-snug text-foreground">{book.title}</h3>
        <p className="truncate text-xs text-muted-foreground">{book.author}</p>
      </div>
    </Link>
  )
}

/** Compact portrait card for horizontal rails (Featured / Trending / New). */
export function BookRailCard({ book }: { book: Book }) {
  return (
    <Link href={`/store/book/${book.id}`} className="group flex w-36 shrink-0 flex-col">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[1.25rem] border border-border/60 bg-muted shadow-elevated transition-transform duration-300 group-active:scale-[0.98]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={book.cover || "/placeholder.svg"}
          alt={`${book.title} cover`}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <WishlistButton id={book.id} className="absolute right-2 top-2" />
        <PriceBadge price={book.price} className="absolute bottom-2 left-2" />
      </div>
      <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-foreground">{book.title}</h3>
      <p className="truncate text-xs text-muted-foreground">{book.author}</p>
    </Link>
  )
}

/** Landscape course card with thumbnail, play affordance, meta + optional progress. */
export function CourseCard({ course, className, href }: { course: Course; className?: string; href?: string }) {
  const showProgress = course.progress != null && course.progress > 0
  return (
    <Link href={href ?? `/store/course/${course.id}`} className={cn("group flex flex-col", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-[1.5rem] border border-border/60 bg-muted shadow-elevated transition-transform duration-300 group-active:scale-[0.98]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={course.thumbnail || "/placeholder.svg"}
          alt={`${course.title} thumbnail`}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-floating backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
          <Play className="size-5 translate-x-0.5 fill-current" />
        </span>
        <WishlistButton id={course.id} className="absolute right-2 top-2" />
        <PriceBadge price={course.price} className="absolute bottom-2 left-2" />
        <span className="absolute bottom-2 right-2 rounded-full bg-background/80 px-2 py-1 text-[11px] font-medium text-foreground backdrop-blur-md">
          {course.lessons.length} lessons · {course.totalDuration}
        </span>
        {showProgress && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span className="block h-full bg-primary" style={{ width: `${Math.round((course.progress || 0) * 100)}%` }} />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{course.title}</h3>
          <p className="truncate text-xs text-muted-foreground">{course.instructor}</p>
        </div>
        <Stars rating={course.rating} className="mt-0.5 shrink-0" />
      </div>
    </Link>
  )
}

/** Narrower landscape course card for horizontal rails. */
export function CourseRailCard({ course }: { course: Course }) {
  return <CourseCard course={course} className="w-64 shrink-0" />
}

/**
 * Portrait grid card for the main Courses grid — mirrors BookGridCard so the
 * Books and Courses tabs share the same premium 3-column layout. The landscape
 * thumbnail is cropped to a 2:3 cover with a play affordance, wishlist heart,
 * price badge, and an optional progress bar.
 */
export function CourseGridCard({ course, index = 0 }: { course: Course; index?: number }) {
  const showProgress = course.progress != null && course.progress > 0
  return (
    <Link
      href={`/store/course/${course.id}`}
      className="group flex flex-col animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[1.25rem] border border-border/60 bg-muted shadow-elevated transition-transform duration-300 group-active:scale-[0.98]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={course.thumbnail || "/placeholder.svg"}
          alt={`${course.title} thumbnail`}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-floating backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
          <Play className="size-4 translate-x-0.5 fill-current" />
        </span>
        <WishlistButton id={course.id} className="absolute right-2 top-2" />
        <PriceBadge price={course.price} className="absolute bottom-2 left-2" />
        {showProgress && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span className="block h-full bg-primary" style={{ width: `${Math.round((course.progress || 0) * 100)}%` }} />
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-0.5">
        <Stars rating={course.rating} />
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{course.title}</h3>
        <p className="truncate text-xs text-muted-foreground">{course.instructor}</p>
      </div>
    </Link>
  )
}
