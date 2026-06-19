import Link from "next/link"
import type { Show } from "@/lib/data"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// Deterministic pseudo view count so the YouTube layout feels real without a backend.
function viewCount(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  const views = 12_000 + (hash % 980_000)
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`
  if (views >= 1_000) return `${Math.round(views / 1000)}K`
  return `${views}`
}

export function YouTubeCard({ show }: { show: Show }) {
  const href = show.status === "upcoming" ? "/#upcoming" : `/live/${show.id}`

  return (
    <Link href={href} className="group flex flex-col gap-3">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        <img
          src={show.cover || "/placeholder.svg"}
          alt={`${show.title} thumbnail`}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {show.duration && (
          <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-xs font-semibold text-foreground tabular-nums">
            {show.duration}
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <Avatar className="mt-0.5 size-9 shrink-0">
          <AvatarImage src={show.host.avatar || "/placeholder.svg"} alt={show.host.name} />
          <AvatarFallback>{show.host.name[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
            {show.title}
          </h3>
          <p className="text-xs text-muted-foreground">{show.host.name}</p>
          <p className="text-xs text-muted-foreground">
            {viewCount(show.id)} views
            {show.publishedAt ? ` · ${show.publishedAt}` : ""}
          </p>
        </div>
      </div>
    </Link>
  )
}
