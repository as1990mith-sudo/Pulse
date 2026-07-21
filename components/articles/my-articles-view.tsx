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
  PenSquare,
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
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/articles")}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/70"
            aria-label="Back to articles"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">My Articles</h1>
        </div>
        <Link
          href="/articles/write"
          className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <PenSquare className="size-4" /> Write
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 rounded-full bg-muted p-1">
        {(["published", "draft", "archived"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-full py-1.5 text-sm font-medium capitalize transition",
              tab === t ? "bg-background text-foreground shadow-soft" : "text-muted-foreground",
            )}
          >
            {t === "draft" ? "Drafts" : t} ({counts[t]})
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-5 flex flex-col gap-3">
        {shown.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border py-14 text-center">
            <p className="text-sm text-muted-foreground">
              {tab === "published"
                ? "You haven't published any articles yet."
                : tab === "draft"
                  ? "No drafts. Start writing something new."
                  : "Nothing archived."}
            </p>
            {tab !== "archived" && (
              <Link
                href="/articles/write"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <PenSquare className="size-4" /> Write an article
              </Link>
            )}
          </div>
        )}

        {shown.map((a) => (
          <div
            key={a.id}
            className="flex gap-3 rounded-2xl border border-border/50 bg-card/60 p-3 shadow-soft"
          >
            {a.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.coverUrl || "/placeholder.svg"}
                alt=""
                className="size-16 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="size-16 shrink-0 rounded-xl bg-gradient-to-br from-primary/20 to-card" />
            )}
            <div className="min-w-0 flex-1">
              <Link href={`/articles/${a.id}`} className="block">
                <h3 className="line-clamp-1 font-display text-[15px] font-semibold text-foreground">
                  {a.title}
                </h3>
              </Link>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.excerpt}</p>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                {a.status === "published" && (
                  <>
                    <span className="flex items-center gap-1">
                      <Eye className="size-3" />
                      {a.viewCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="size-3" />
                      {a.likeCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="size-3" />
                      {a.commentCount}
                    </span>
                  </>
                )}
                <span className="capitalize">{a.category}</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/articles/write?id=${a.id}`)}>
                  <Pencil className="mr-2 size-4" /> Edit
                </DropdownMenuItem>
                {a.status !== "published" ? (
                  <DropdownMenuItem onClick={() => handlePublish(a.id)}>
                    <Send className="mr-2 size-4" /> Publish
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => handleUnpublish(a.id)}>
                    <ArchiveRestore className="mr-2 size-4" /> Move to drafts
                  </DropdownMenuItem>
                )}
                {a.status !== "archived" ? (
                  <DropdownMenuItem onClick={() => handleArchive(a.id)}>
                    <Archive className="mr-2 size-4" /> Archive
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => handleUnpublish(a.id)}>
                    <ArchiveRestore className="mr-2 size-4" /> Restore to drafts
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => handleDelete(a.id)} className="text-destructive">
                  <Trash2 className="mr-2 size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  )
}
