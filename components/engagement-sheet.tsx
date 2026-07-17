"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import useSWR from "swr"
import { Bookmark, Heart, Loader2, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getPostLikers, getPostSavers, type PostEngager } from "@/app/actions/feed"
import { cn } from "@/lib/utils"

/**
 * Bottom sheet that lists the unique accounts who liked or saved a post. Only
 * shown to the post's author (the server actions enforce that too). People are
 * fetched lazily while the sheet is open and each row links to their profile.
 */
export function EngagementSheet({
  postId,
  kind,
  open,
  onClose,
}: {
  postId: number
  kind: "likes" | "saves"
  open: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (open) {
      setVisible(true)
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  const { data: people = [], isLoading } = useSWR<PostEngager[]>(
    open ? [`post-${kind}`, postId] : null,
    () => (kind === "likes" ? getPostLikers(postId) : getPostSavers(postId)),
    { revalidateOnFocus: false },
  )

  if (!mounted || !open) return null

  const title = kind === "likes" ? "Liked by" : "Saved by"
  const Icon = kind === "likes" ? Heart : Bookmark
  const emptyText = kind === "likes" ? "No likes yet." : "No one has saved this yet."

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={`Close ${title} list`}
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        className={cn(
          "relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-popover text-popover-foreground shadow-2xl transition-transform duration-300 ease-out sm:rounded-3xl",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="shrink-0 px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-muted-foreground/25" />
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Icon className="size-[18px] fill-current text-primary" />
              {title}
              {people.length > 0 && <span className="text-muted-foreground">{people.length}</span>}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-full bg-secondary/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-[18px]" />
            </button>
          </div>
        </div>

        <div data-scroll className="min-h-[8rem] flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {isLoading ? (
            <div className="flex h-28 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : people.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            <ul className="flex flex-col">
              {people.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/u/${p.id}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-secondary/60"
                  >
                    <Avatar className="size-11 ring-2 ring-border/60">
                      {p.image && <AvatarImage src={p.image || "/placeholder.svg"} alt={p.name} />}
                      <AvatarFallback className={p.color}>{p.initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.handle}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
