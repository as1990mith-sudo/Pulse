"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  Clock,
  History,
  Sparkles,
  X,
} from "lucide-react"
import type { ArticleCard, LibraryArticleCard, LibraryData } from "@/lib/article-types"
import { AuthorAvatar } from "@/components/articles/author-avatar"
import { toggleSaveItem } from "@/app/actions/share"

/**
 * The Library — a personalised reading hub for articles, styled to match the
 * Articles page language: editorial section headings, an uppercase category
 * eyebrow, `font-display` titles that shift to primary on hover, and borderless
 * collections separated by hairline dividers rather than boxed cards.
 */
export function LibraryView({ library }: { library: LibraryData }) {
  const { continueReading, history } = library
  const [saved, setSaved] = useState<ArticleCard[]>(library.saved)
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

      <section>
        <SectionHeading icon={<BookMarked className="size-4" />} title="Saved" caption="Bookmarked for later" />
        {saved.length === 0 ? (
          <InlineEmpty
            icon={<BookMarked className="size-5" />}
            message="Tap the bookmark on any article and it lands here for later."
          />
        ) : (
          <ul className="-mt-1 flex flex-col divide-y divide-border/40">
            {saved.map((a) => (
              <SavedRow
                key={a.id}
                article={a}
                onRemoved={() => setSaved((prev) => prev.filter((x) => x.id !== a.id))}
              />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <SectionHeading icon={<History className="size-4" />} title="Reading History" caption="Everything you've opened" />
          <ul className="-mt-1 flex flex-col divide-y divide-border/40">
            {history.map((a) => (
              <HistoryRow key={a.id} article={a} saved={savedIds.has(a.id)} />
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
        <span className="absolute bottom-2 left-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">
          {article.category}
        </span>
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
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{article.category}</span>
          <h3 className="mt-1 line-clamp-2 text-pretty font-display text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
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

/** A dense history row with a status that distinguishes completed vs in-progress. */
function HistoryRow({ article, saved }: { article: LibraryArticleCard; saved: boolean }) {
  return (
    <li>
      <Link href={`/articles/${article.id}`} className="tap-scale group flex items-center gap-4 py-4">
        <RowThumb coverUrl={article.coverUrl} />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{article.category}</span>
          <h3 className="mt-1 line-clamp-2 text-pretty font-display text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
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
      </Link>
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

function InlineEmpty({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="mt-1 flex items-center gap-3 rounded-2xl border border-dashed border-border/50 px-4 py-5 text-sm text-muted-foreground">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground ring-1 ring-border/40">
        {icon}
      </span>
      <p className="text-pretty">{message}</p>
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
