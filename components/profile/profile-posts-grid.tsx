"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, Heart, MessageCircle, Repeat2 } from "lucide-react"
import type { FeedPostView } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import { PostCard } from "@/components/mind-feed"
import { cn } from "@/lib/utils"

/**
 * Profile "Posts" tab: a 2-column grid of post tiles. Tapping a tile opens a
 * fullscreen, scroll-snapping viewer that starts on the chosen post and reveals
 * the next post as you scroll down (Instagram-style).
 */
export function ProfilePostsGrid({
  posts,
  currentUser,
}: {
  posts: FeedPostView[]
  currentUser: CurrentUser | null
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4">
        {posts.map((post, i) => (
          <li key={post.id}>
            <PostTile post={post} onOpen={() => setOpenIndex(i)} />
          </li>
        ))}
      </ul>

      {openIndex !== null && (
        <PostsViewer
          posts={posts}
          startIndex={openIndex}
          currentUser={currentUser}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  )
}

function PostTile({ post, onOpen }: { post: FeedPostView; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex aspect-square w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-colors hover:border-primary/50"
    >
      {post.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.image || "/placeholder.svg"}
          alt=""
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : post.video ? (
        <video src={post.video} muted playsInline className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center p-4">
          <p className="line-clamp-5 text-pretty text-sm leading-relaxed text-foreground/90">{post.text}</p>
        </div>
      )}

      {/* Engagement overlay */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-xs font-medium text-white">
        <span className="flex items-center gap-1">
          <Heart className="size-3.5" /> {post.likes}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="size-3.5" /> {post.comments.length}
        </span>
        {post.reposts > 0 && (
          <span className="flex items-center gap-1">
            <Repeat2 className="size-3.5" /> {post.reposts}
          </span>
        )}
      </span>
    </button>
  )
}

function PostsViewer({
  posts,
  startIndex,
  currentUser,
  onClose,
}: {
  posts: FeedPostView[]
  startIndex: number
  currentUser: CurrentUser | null
  onClose: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(startIndex)

  // Lock background scroll and jump to the chosen post on open.
  useEffect(() => {
    document.body.style.overflow = "hidden"
    const target = itemRefs.current[startIndex]
    if (target) target.scrollIntoView({ block: "start" })
    return () => {
      document.body.style.overflow = ""
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track which post is centered for the header counter.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = itemRefs.current.findIndex((el) => el === entry.target)
            if (idx >= 0) setActive(idx)
          }
        }
      },
      { root, threshold: 0.6 },
    )
    for (const el of itemRefs.current) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <p className="text-sm font-medium text-muted-foreground tabular-nums">
          {active + 1} / {posts.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
        >
          <X className="size-5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {posts.map((post, i) => (
          <div
            key={post.id}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className={cn(
              "flex min-h-full snap-start items-start justify-center px-4 py-6",
            )}
          >
            <div className="w-full max-w-xl">
              <PostCard post={post} currentUser={currentUser} />
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
