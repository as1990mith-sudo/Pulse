"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Check,
  Clock,
  Globe,
  GraduationCap,
  Heart,
  Layers,
  Loader2,
  Lock,
  Play,
  ShoppingBag,
} from "lucide-react"
import type { Book, Course } from "@/lib/store-data"
import { BOOKS, COURSES, formatPrice } from "@/lib/store-data"
import { useStoreState } from "@/lib/use-store-state"
import { ShareButton, Stars, BookRailCard, CourseRailCard } from "@/components/store/store-cards"
import { cn } from "@/lib/utils"

type Product = Book | Course

function isCourse(p: Product): p is Course {
  return p.type === "course"
}

export function ProductView({ product }: { product: Product }) {
  const router = useRouter()
  const { isWishlisted, toggleWishlist, isInLibrary, addToLibrary } = useStoreState()
  const owned = isInLibrary(product.id)
  const wished = isWishlisted(product.id)

  const [status, setStatus] = useState<"idle" | "processing">("idle")
  const [celebrate, setCelebrate] = useState(false)

  // The purchase bar is portaled to <body> so it stays pinned to the viewport.
  // The page-transition wrapper (.page-enter) uses transform/will-change, which
  // would otherwise trap a `fixed` child inside its containing block.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const course = isCourse(product) ? product : null
  const book = !isCourse(product) ? product : null

  function purchase() {
    if (owned || status === "processing") return
    setStatus("processing")
    // Simulated purchase — real checkout is wired in a later pass.
    setTimeout(() => {
      addToLibrary(product.id)
      setStatus("idle")
      setCelebrate(true)
      setTimeout(() => setCelebrate(false), 2200)
    }, 1200)
  }

  const related = (isCourse(product) ? COURSES : BOOKS).filter((p) => p.id !== product.id).slice(0, 8)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-28 pt-3 sm:px-6">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.back()}
        className="tap-scale mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </button>

      {/* Hero — compact so the cover, title, price and buy bar all sit above the
          fold without scrolling. */}
      <div className="relative mb-5 overflow-hidden rounded-[2rem] border border-border/60 p-4 shadow-elevated sm:p-6">
        {/* Blurred cover backdrop */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={(course?.thumbnail || book?.cover) ?? "/placeholder.svg"}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-20 blur-2xl"
        />
        <div className="relative flex flex-row items-start gap-4 sm:gap-6">
          {course ? (
            <Link
              href={`/store/course/${course.id}`}
              className="group relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-2xl border border-border/60 shadow-floating sm:w-40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={course.thumbnail || "/placeholder.svg"} alt={course.title} className="size-full object-cover" />
              <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-floating backdrop-blur-md transition-transform group-hover:scale-110">
                <Play className="size-5 translate-x-0.5 fill-current" />
              </span>
            </Link>
          ) : (
            <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-2xl border border-border/60 shadow-floating sm:w-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={book!.cover || "/placeholder.svg"} alt={book!.title} className="size-full object-cover" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col items-start text-left">
            <h1 className="text-balance font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
              {product.title}
            </h1>
            <p className="mt-1 line-clamp-2 text-pretty text-sm text-muted-foreground">{product.subtitle}</p>

            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{course ? course.instructor : book!.author}</span>
              <BadgeCheck className="size-4 text-primary" />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Stars rating={product.rating} count={product.ratingCount} />
              <span className="text-xl font-bold text-foreground">{formatPrice(product.price)}</span>
            </div>

            {/* Meta chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              <MetaChip icon={Layers} label={product.category} />
              <MetaChip icon={Globe} label={product.language} />
              {course ? (
                <>
                  <MetaChip icon={BookOpen} label={`${course.lessons.length} lessons`} />
                  <MetaChip icon={Clock} label={course.totalDuration} />
                  <MetaChip icon={GraduationCap} label={course.difficulty} />
                </>
              ) : (
                <MetaChip icon={BookOpen} label={`${book!.pages} pages`} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-foreground">About</h2>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{product.description}</p>
      </section>

      {/* Course curriculum */}
      {course && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Curriculum</h2>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/60">
            {course.lessons.map((lesson, i) => {
              const preview = i === 0
              const unlocked = owned || preview
              return (
                <li key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      unlocked ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground",
                    )}
                  >
                    {unlocked ? <Play className="size-3.5 translate-x-px fill-current" /> : <Lock className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {i + 1}. {lesson.title}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {lesson.kind} · {lesson.duration}
                    </p>
                  </div>
                  {preview && !owned && (
                    <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Preview
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Related */}
      <section className="mb-4">
        <h2 className="mb-3 text-lg font-semibold text-foreground">You may also like</h2>
        <div data-scroll className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {related.map((p) =>
            p.type === "course" ? (
              <CourseRailCard key={p.id} course={p} />
            ) : (
              <BookRailCard key={p.id} book={p} />
            ),
          )}
        </div>
      </section>

      {/* Sticky purchase bar — portaled to <body> so it stays pinned to the
          viewport regardless of the page-transition wrapper's transform. */}
      {mounted &&
        createPortal(
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 pb-safe-2 pt-3 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => toggleWishlist(product.id)}
            aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={wished}
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-secondary/40 text-foreground transition-transform active:scale-90"
          >
            <Heart className={cn("size-5", wished && "fill-rose-500 text-rose-500 motion-pop")} />
          </button>
          <ShareButton
            title={product.title}
            className="size-12 shrink-0 rounded-2xl border border-border/60 bg-secondary/40"
          />

          {owned ? (
            <Link
              href="/library"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98]"
            >
              <Check className="size-5" />
              In Library
            </Link>
          ) : (
            <button
              type="button"
              onClick={purchase}
              disabled={status === "processing"}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98] disabled:opacity-80"
            >
              {status === "processing" ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <ShoppingBag className="size-5" />
                  {product.price === 0 ? "Get for free" : `Buy · ${formatPrice(product.price)}`}
                </>
              )}
            </button>
          )}
            </div>
          </div>,
          document.body,
        )}

      {/* Purchase success celebration */}
      {mounted &&
        celebrate &&
        createPortal(<PurchaseSuccess title={product.title} isCourse={!!course} />, document.body)}
    </div>
  )
}

function MetaChip({ icon: Icon, label }: { icon: typeof BookOpen; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs font-medium text-foreground">
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
    </span>
  )
}

function PurchaseSuccess({ title, isCourse }: { title: string; isCourse: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="mx-6 flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-border/60 bg-popover/95 p-8 text-center shadow-floating animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 [animation-timing-function:cubic-bezier(0.34,1.56,0.64,1)]">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary motion-pop">
          <Check className="size-8" />
        </span>
        <h3 className="text-lg font-semibold text-foreground">Added to your Library</h3>
        <p className="text-pretty text-sm text-muted-foreground">
          {title} is ready. {isCourse ? "Start learning" : "Start reading"} whenever you like.
        </p>
        <Link
          href="/library"
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          Go to Library
        </Link>
      </div>
    </div>
  )
}
