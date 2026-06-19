import Link from "next/link"
import { Clock, Play } from "lucide-react"
import type { Show } from "@/lib/data"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LiveBadge, ListenerCount } from "@/components/live-badge"

export function ShowCard({ show }: { show: Show }) {
  const href = show.status === "upcoming" ? "/#upcoming" : `/live/${show.id}`

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-colors hover:border-primary/50"
    >
      <div className="relative aspect-video overflow-hidden">
        <img
          src={show.cover || "/placeholder.svg"}
          alt={`${show.title} cover art`}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent" />
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
          <h3 className="font-semibold leading-tight text-balance">{show.title}</h3>
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
