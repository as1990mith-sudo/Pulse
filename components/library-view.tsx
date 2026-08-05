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
import { cn } from "@/lib/utils"

/**
 * The Library — a personalised reading hub for articles. Three stacked sections
 * give a clear hierarchy: pick back up where you left off, jump to what you
 * bookmarked, and revisit anything you've opened before. Completed, in-progress,
 * and saved states are visually distinct throughout.
 */
export function LibraryView({ library }: { library: LibraryData }) {
  const { continueReading, history } = library
  const [saved, setSaved] = useState<ArticleCard[]>(library.saved)
  const savedIds = new Set(saved.map((a) => a.id))
  const isEmpty = continueReading.length === 0 && saved.length === 0 && history.length === 0

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-7">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <BookMarked className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Library</h1>
            <p className="text-sm text-muted-foreground">Your reading, kept in one place</p>
          </div>
        </div>
      </header>

      {isEmpty ? (
        <EmptyLibrary />
      ) : (
        <div className="flex flex-col gap-9">
          {continueReading.length > 0 && (
            <section>
              <SectionHeading
                icon={<BookOpen className="size-4" />}
                title="Continue Reading"
                caption="Right where you stopped"
              />
              <div
                data-scroll
                className="hscroll -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
              >
                {continueReading.map((a) => (
                  <ContinueCard key={a.id} article={a} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeading
              icon={<BookMarked className="size-4" />}
              title="Saved"
              caption={saved.length > 0 ? `${saved.length} bookmarked` : "Bookmark articles to build your list"}
            />
            {saved.length === 0 ? (
              <InlineEmpty
                icon={<BookMarked className="size-5" />}
                message="Tap the bookmark on any article and it lands here for later."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {saved.map((a) => (
                  <SavedCard
                    key={a.id}
                    article={a}
                    onRemoved={() => setSaved((prev) => prev.filter((x) => x.id !== a.id))}
                  />
                ))}
              </div>
            )}
          </section>

          {history.length > 0 && (
            <section>
              <SectionHeading
                icon={<History className="size-4" />}
                title="Reading History"
                caption="Everything you've opened"
              />
              <ul className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card">
                {history.map((a) => (
                  <HistoryRow key={a.id} article={a} saved={savedIds.has(a.id)} />
                ))}
              </ul>
            </section>
          )}
        </div>
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
  caption: string
}) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary/12 text-primary">{icon}</span>
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold leading-none tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 truncate text-xs text-muted-foreground">{caption}</p>
      </div>
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
      className="tap-scale group flex w-60 shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevated ring-1 ring-white/5 transition-colors hover:border-primary/40"
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
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute bottom-2 left-2.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
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

/** A saved bookmark tile with an inline remove control. */
function SavedCard({ article, onRemoved }: { article: ArticleCard; onRemoved: () => void }) {
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
    <Link
      href={`/articles/${article.id}`}
      className="tap-scale group relative flex gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-elevated ring-1 ring-white/5 transition-colors hover:border-primary/40"
    >
      <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
        {article.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.coverUrl || "/placeholder.svg"} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <BookOpen className="size-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{article.category}</span>
        <h3 className="mt-0.5 line-clamp-2 text-pretty font-display text-[13px] font-semibold leading-snug text-foreground group-hover:text-primary">
          {article.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <AuthorAvatar author={article.author} size={15} />
          <span className="max-w-24 truncate">{article.author.name}</span>
          <span aria-hidden>·</span>
          <span>{article.readMinutes}m</span>
        </div>
      </div>
      <button
        onClick={remove}
        disabled={pending}
        aria-label="Remove from saved"
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground opacity-100 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        <X className="size-3.5" />
      </button>
    </Link>
  )
}

/** A dense history row with a status that distinguishes completed vs in-progress. */
function HistoryRow({ article, saved }: { article: LibraryArticleCard; saved: boolean }) {
  return (
    <li>
      <Link
        href={`/articles/${article.id}`}
        className="group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-secondary/40"
      >
        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
          {article.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.coverUrl || "/placeholder.svg"} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <BookOpen className="size-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 font-display text-sm font-semibold text-foreground group-hover:text-primary">
            {article.title}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="max-w-28 truncate">{article.author.name}</span>
            <span aria-hidden>·</span>
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

/** Emerald "Read" badge for completed articles; a percent chip while in progress. */
function StatusPill({ article }: { article: LibraryArticleCard }) {
  if (article.completed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
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
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-secondary/20 px-4 py-5 text-sm text-muted-foreground">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="text-pretty">{message}</p>
    </div>
  )
}

function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 px-6 py-20 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Sparkles className="size-8" />
      </span>
      <h2 className="font-display text-lg font-semibold text-foreground">Your Library is waiting</h2>
      <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
        Start reading an article and it will show up here — with your progress saved so you can pick right back up.
      </p>
      <Link
        href="/articles"
        className="tap-scale mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Explore Articles
        <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}
