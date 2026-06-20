import Link from "next/link"
import { Clock, Play } from "lucide-react"
import type { Show } from "@/lib/data"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LiveBadge, ListenerCount } from "@/components/live-badge"

/** Compact horizontal row used for list layouts (e.g. a profile's episodes). */
export function ShowRow({ show }: { show: Show }) {
  const href = show.status === "upcoming" ? "/#upcoming" : `/live/${show.id}`

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-live/50"
    >
      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg sm:w-40">
        <img
          src={show.cover || "/placeholder.svg"}
          alt={`${show.title} cover art`}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          {show.status === "live" && <LiveBadge />}
          {show.status === "ended" && (
            <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] font-medium">
              <Play className="size-2.5" /> {show.duration}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-border/60 text-[10px] text-muted-foreground">
            {show.category}
          </Badge>
          {show.status === "live" ? (
            <ListenerCount count={show.listeners} />
          ) : (
            <span className="text-xs text-muted-foreground">{show.publishedAt}</span>
          )}
        </div>
        <h3 className="truncate font-semibold leading-tight transition-colors group-hover:text-live">
          {show.title}
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">{show.tagline}</p>
      </div>

      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-live group-hover:text-white">
        <Play className="size-4" />
      </span>
    </Link>
  )
}

export function ShowCard({ show }: { show: Show }) {
  const href = show.status === "upcoming" ? "/#upcoming" : `/live/${show.id}`

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-colors hover:border-live/50"
    >
      <div className="relative aspect-video overflow-hidden">
        <img
          src={show.cover || "/placeholder.svg"}
          alt={`${show.title} cover art`}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          {show.status === "live" && <LiveBadge />}
          {show.status === "upcoming" && (
            <Badge variant="secondary" className="gap-1 font-medium">
              <Clock className="size-3" /> {show.startsAt}
            </Badge>
          )}
          {show.status === "ended" && (
            <Badge variant="secondary" className="gap-1 font-medium">
              <Play className="size-3" /> {show.duration}
            </Badge>
          )}
        </div>
        <Badge
          variant="outline"
          className="absolute right-3 top-3 border-border/60 bg-background/60 text-foreground backdrop-blur"
        >
          {show.category}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="font-semibold leading-tight text-balance transition-colors group-hover:text-live">
            {show.title}
          </h3>
          <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">{show.tagline}</p>
        </div>
        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="size-6">
              <AvatarImage src={show.host.avatar || "/placeholder.svg"} alt={show.host.name} />
              <AvatarFallback>{show.host.name[0]}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">{show.host.name}</span>
          </div>
          {show.status === "live" ? (
            <ListenerCount count={show.listeners} />
          ) : (
            <span className="text-xs text-muted-foreground">{show.publishedAt}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
