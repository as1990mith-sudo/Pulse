"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Eye,
  Heart,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Send,
} from "lucide-react"
import type { ArticleCard } from "@/lib/article-types"
import {
  archiveArticle,
  deleteArticle,
  publishArticle,
  unpublishArticle,
} from "@/app/actions/articles"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type Tab = "published" | "draft" | "archived"

const TABS: { key: Tab; label: string }[] = [
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
]

export function MyArticlesView({ initial }: { initial: ArticleCard[] }) {
  const router = useRouter()
  const [items, setItems] = useState<ArticleCard[]>(initial)
  const [tab, setTab] = useState<Tab>("published")
  const [, startTransition] = useTransition()

  const counts = useMemo(
    () => ({
      published: items.filter((a) => a.status === "published").length,
      draft: items.filter((a) => a.status === "draft").length,
      archived: items.filter((a) => a.status === "archived").length,
    }),
    [items],
  )

  const shown = items.filter((a) => a.status === tab)

  function updateStatus(id: string, status: Tab) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }

  function handlePublish(id: string) {
    updateStatus(id, "published")
    startTransition(() => void publishArticle(id).catch(() => router.refresh()))
  }
  function handleUnpublish(id: string) {
    updateStatus(id, "draft")
    startTransition(() => void unpublishArticle(id).catch(() => router.refresh()))
  }
  function handleArchive(id: string) {
    updateStatus(id, "archived")
    startTransition(() => void archiveArticle(id).catch(() => router.refresh()))
  }
  function handleDelete(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id))
    startTransition(() => void deleteArticle(id).catch(() => router.refresh()))
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6">
      {/* Header — quiet ghost back control, editorial title, primary Write. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={() => router.push("/articles")}
            className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            aria-label="Back to articles"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold tracking-tight text-foreground">My Articles</h1>
          </div>
        </div>
        <Link
          href="/articles/write"
          className="tap-scale flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
        >
          <PenLine className="size-4" /> Write
        </Link>
      </div>

      {/* Tabs — editorial section nav with a thin orange active underline. */}
      <nav
        data-scroll
        aria-label="Article status"
        className="-mx-4 mt-5 flex items-center border-b border-border/40 px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map(({ key, label }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "relative flex-1 whitespace-nowrap pb-2.5 pt-1 text-center text-sm transition-colors duration-200",
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground/70 hover:text-foreground",
              )}
            >
              {label}
              <span className={cn("ml-1 tabular-nums", active ? "text-primary" : "text-muted-foreground/50")}>
                {counts[key]}
              </span>
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 -bottom-px h-0.5 origin-center rounded-full bg-primary transition-all duration-300 ease-out",
                  active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                )}
              />
            </button>
          )
        })}
      </nav>

      {/* List — a connected editorial collection separated by hairline rules. */}
      {shown.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="mt-1 flex flex-col divide-y divide-border/40">
          {shown.map((a) => (
            <MyArticleRow
              key={a.id}
              article={a}
              onEdit={() => router.push(`/articles/write?id=${a.id}`)}
              onPublish={() => handlePublish(a.id)}
              onUnpublish={() => handleUnpublish(a.id)}
              onArchive={() => handleArchive(a.id)}
              onDelete={() => handleDelete(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0).replace(/\.0$/, "") + "k"
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m"
}

function MyArticleRow({
  article: a,
  onEdit,
  onPublish,
  onUnpublish,
  onArchive,
  onDelete,
}: {
  article: ArticleCard
  onEdit: () => void
  onPublish: () => void
  onUnpublish: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <div className="group flex gap-4 py-5 sm:gap-5">
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{a.category}</span>
        <Link href={`/articles/${a.id}`} className="tap-scale block">
          <h3 className="mt-1.5 line-clamp-2 text-pretty font-display text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-lg">
            {a.title}
          </h3>
        </Link>
        {a.excerpt && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{a.excerpt}</p>
        )}
        <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
          {a.status === "published" ? (
            <>
              <span className="flex items-center gap-1">
                <Eye className="size-3" />
                {compact(a.viewCount)}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="size-3" />
                {compact(a.likeCount)}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="size-3" />
                {compact(a.commentCount)}
              </span>
            </>
          ) : (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
                a.status === "draft"
                  ? "bg-secondary/60 text-muted-foreground"
                  : "bg-muted text-muted-foreground/80",
              )}
            >
              {a.status === "draft" ? "Draft" : "Archived"}
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="tap-scale ml-auto flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground data-[state=open]:bg-secondary/60 data-[state=open]:text-foreground">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Article actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 size-4" /> Edit
              </DropdownMenuItem>
              {a.status !== "published" ? (
                <DropdownMenuItem onClick={onPublish}>
                  <Send className="mr-2 size-4" /> Publish
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onUnpublish}>
                  <ArchiveRestore className="mr-2 size-4" /> Move to drafts
                </DropdownMenuItem>
              )}
              {a.status !== "archived" ? (
                <DropdownMenuItem onClick={onArchive}>
                  <Archive className="mr-2 size-4" /> Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onUnpublish}>
                  <ArchiveRestore className="mr-2 size-4" /> Restore to drafts
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Link
        href={`/articles/${a.id}`}
        className="tap-scale relative size-24 shrink-0 overflow-hidden rounded-xl sm:size-28"
        aria-hidden
        tabIndex={-1}
      >
        {a.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.coverUrl || "/placeholder.svg"}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-primary/30 via-secondary/40 to-card" />
        )}
      </Link>
    </div>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy =
    tab === "published"
      ? "Your published articles will appear here."
      : tab === "draft"
        ? "No drafts yet — start writing something new."
        : "Nothing archived."
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center animate-in fade-in duration-500">
      <span className="relative mb-4 flex size-14 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-full bg-primary/5 blur-md" />
        <span className="relative flex size-14 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground/80 ring-1 ring-border/40">
          <PenLine className="size-6" />
        </span>
      </span>
      <p className="font-display text-base font-semibold tracking-tight text-foreground">
        {tab === "published" ? "No articles here yet" : tab === "draft" ? "No drafts" : "Nothing archived"}
      </p>
      <p className="mt-1.5 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">{copy}</p>
      {tab !== "archived" && (
        <Link
          href="/articles/write"
          className="tap-scale mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          <PenLine className="size-4" />
          Write an article
        </Link>
      )}
    </div>
  )
}
