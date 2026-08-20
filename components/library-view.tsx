"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  Clock,
  History,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import type { ArticleCard, LibraryArticleCard, LibraryData } from "@/lib/article-types"
import { AuthorAvatar } from "@/components/articles/author-avatar"
import { toggleSaveItem } from "@/app/actions/share"
import { deleteReadingHistory } from "@/app/actions/articles"
import { cn } from "@/lib/utils"

// Drag further left than this (px) to trigger swipe-to-delete on release.
const SWIPE_DELETE_THRESHOLD = 96

/**
 * The Library — a personalised reading hub for articles, styled to match the
 * Articles page language: editorial section headings, an uppercase category
 * eyebrow, `font-display` titles that shift to primary on hover, and borderless
 * collections separated by hairline dividers rather than boxed cards.
 */
export function LibraryView({ library }: { library: LibraryData }) {
  const { continueReading } = library
  const [saved, setSaved] = useState<ArticleCard[]>(library.saved)
  const [history, setHistory] = useState<LibraryArticleCard[]>(library.history)
  const savedIds = new Set(saved.map((a) => a.id))
  const isEmpty = continueReading.length === 0 && saved.length === 0 && history.length === 0

  if (isEmpty) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6">
        <EmptyLibrary />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-24 pt-4 sm:px-6">
      {continueReading.length > 0 && (
        <section>
          <SectionHeading icon={<BookOpen className="size-4" />} title="Continue Reading" />
          <div data-scroll className="hscroll -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {continueReading.map((a) => (
              <ContinueCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {/* Saved only appears once the reader has actually bookmarked something —
          no empty-state placeholder when the collection is empty. */}
      {saved.length > 0 && (
        <section>
          <SectionHeading icon={<BookMarked className="size-4" />} title="Saved" caption="Bookmarked for later" />
          <ul className="-mt-1 flex flex-col divide-y divide-border/40">
            {saved.map((a) => (
              <SavedRow
                key={a.id}
                article={a}
                onRemoved={() => setSaved((prev) => prev.filter((x) => x.id !== a.id))}
              />
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <SectionHeading icon={<History className="size-4" />} title="Reading History" caption="Swipe left to remove" />
          <ul className="-mt-1 flex flex-col divide-y divide-border/40">
            {history.map((a) => (
              <HistoryRow
                key={a.id}
                article={a}
                saved={savedIds.has(a.id)}
                onRemoved={() => setHistory((prev) => prev.filter((x) => x.id !== a.id))}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/* --------------------------------- pieces --------------------------------- */

function SectionHeading({
  icon,
  title,
  caption,
}: {
  icon: React.ReactNode
  title: string
  caption?: string
}) {
  return (
    <div className="mb-2 flex items-baseline gap-2.5">
      <span className="shrink-0 translate-y-0.5 text-primary">{icon}</span>
      <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {caption && (
        <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
          {caption}
        </span>
      )}
    </div>
  )
}

/** Minutes of reading left, derived from the estimate and progress. */
function minutesLeft(article: LibraryArticleCard): number {
  return Math.max(1, Math.round((article.readMinutes * (100 - article.percent)) / 100))
}

/** A cover-forward resume card with a live progress bar. */
function ContinueCard({ article }: { article: LibraryArticleCard }) {
  return (
    <Link
      href={`/articles/${article.id}`}
      className="tap-scale group flex w-60 shrink-0 flex-col overflow-hidden rounded-2xl bg-card shadow-elevated transition-transform duration-300"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        {article.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.coverUrl || "/placeholder.svg"}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-primary/25 via-secondary/40 to-card" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 text-pretty font-display text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
          {article.title}
        </h3>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <AuthorAvatar author={article.author} size={16} />
          <span className="max-w-24 truncate font-medium text-foreground/75">{article.author.name}</span>
        </div>
        <div className="mt-auto pt-3">
          <ProgressBar percent={article.percent} />
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-primary">{article.percent}%</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3" />
              {minutesLeft(article)} min left
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

/** Shared thumbnail for the dense Saved / History rows. */
function RowThumb({ coverUrl }: { coverUrl: string | null }) {
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl || "/placeholder.svg"}
          alt=""
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <BookOpen className="size-5" />
        </div>
      )}
    </div>
  )
}

/** A saved bookmark row with an inline remove control. */
function SavedRow({ article, onRemoved }: { article: ArticleCard; onRemoved: () => void }) {
  const [pending, startTransition] = useTransition()

  function remove(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onRemoved()
    startTransition(async () => {
      try {
        await toggleSaveItem({
          type: "article",
          key: article.id,
          title: article.title,
          subtitle: `by ${article.author.name}`,
          url: `/articles/${article.id}`,
          image: article.coverUrl,
        })
      } catch {
        // Best-effort; the list has already updated optimistically.
      }
    })
  }

  return (
    <li>
      <Link href={`/articles/${article.id}`} className="tap-scale group flex items-center gap-4 py-4">
        <RowThumb coverUrl={article.coverUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-pretty font-display text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {article.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <AuthorAvatar author={article.author} size={16} />
            <span className="max-w-28 truncate">{article.author.name}</span>
            <span aria-hidden className="text-border">·</span>
            <span>{article.readMinutes}m read</span>
          </div>
        </div>
        <button
          onClick={remove}
          disabled={pending}
          aria-label="Remove from saved"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          <X className="size-4" />
        </button>
      </Link>
    </li>
  )
}

/**
 * A dense history row that can be swiped left to remove from reading history.
 * Pointer-based (mouse + touch), axis-locked so vertical scrolling still works,
 * and it optimistically removes on release past the threshold, then persists via
 * `deleteReadingHistory`. A clean tap (no horizontal drag) opens the article.
 */
function HistoryRow({
  article,
  saved,
  onRemoved,
}: {
  article: LibraryArticleCard
  saved: boolean
  onRemoved: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [dx, setDx] = useState(0)
  const [removing, setRemoving] = useState(false)

  const startX = useRef(0)
  const startY = useRef(0)
  const draggingAxis = useRef<null | "x" | "y">(null)
  const moved = useRef(false)

  function commitDelete() {
    setRemoving(true)
    setDx(-window.innerWidth)
    // Persist first, then drop from the list once the exit animation has played.
    startTransition(async () => {
      try {
        await deleteReadingHistory(article.id)
      } catch {
        // Best-effort; optimistic removal already ran on the client.
      }
    })
    setTimeout(onRemoved, 180)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    startX.current = e.clientX
    startY.current = e.clientY
    draggingAxis.current = null
    moved.current = false
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const deltaX = e.clientX - startX.current
    const deltaY = e.clientY - startY.current
    // Lock to an axis once movement is meaningful so vertical scroll is preserved.
    if (draggingAxis.current === null && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      draggingAxis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y"
      if (draggingAxis.current === "x") {
        moved.current = true
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          // ignore unsupported capture
        }
      }
    }
    // Allow left swipe (negative); resist dragging right past the origin.
    if (draggingAxis.current === "x") setDx(Math.min(0, deltaX))
  }

  const onPointerUp = () => {
    if (draggingAxis.current === "x") {
      if (dx <= -SWIPE_DELETE_THRESHOLD) {
        commitDelete()
        return
      }
      setDx(0)
      return
    }
    // Clean tap → open the article.
    if (!moved.current) router.push(`/articles/${article.id}`)
  }

  const onPointerCancel = () => setDx(0)

  return (
    <li className="relative">
      {/* Red delete affordance revealed as the row slides left. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-end rounded-xl bg-destructive pr-5 text-white transition-opacity",
          dx < -8 ? "opacity-100" : "opacity-0",
        )}
      >
        <Trash2 className="size-5" />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${article.title}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            router.push(`/articles/${article.id}`)
          }
        }}
        style={{ transform: `translateX(${dx}px)` }}
        className={cn(
          "tap-scale group flex touch-pan-y select-none items-center gap-4 bg-background py-4",
          (dx === 0 || removing) && "transition-transform duration-200",
        )}
      >
        <RowThumb coverUrl={article.coverUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-pretty font-display text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {article.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="max-w-28 truncate">{article.author.name}</span>
            <span aria-hidden className="text-border">·</span>
            <span>{article.readMinutes}m read</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saved && <BookMarked className="size-3.5 text-primary" aria-label="Saved" />}
          <StatusPill article={article} />
        </div>
      </div>
    </li>
  )
}

/** "Read" badge for completed articles; a percent chip while in progress. */
function StatusPill({ article }: { article: LibraryArticleCard }) {
  if (article.completed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
        <Check className="size-3" />
        Read
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      <Clock className="size-3" />
      {article.percent}%
    </span>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(3, percent))}%` }}
      />
    </div>
  )
}

function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center animate-in fade-in duration-500">
      <span className="relative mb-4 flex size-14 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-full bg-primary/5 blur-md" />
        <span className="relative flex size-14 items-center justify-center rounded-full bg-secondary/50 text-primary ring-1 ring-border/40">
          <Sparkles className="size-6" />
        </span>
      </span>
      <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Your Library is waiting</h2>
      <p className="mt-1.5 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
        Start reading an article and it will show up here — with your progress saved so you can pick right back up.
      </p>
      <Link
        href="/articles"
        className="tap-scale mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-90"
      >
        Explore Articles
        <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}
