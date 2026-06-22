import Link from "next/link"
import { Mic, Radio, Video } from "lucide-react"
import type { LiveStreamView } from "@/app/actions/live"
import { LiveBadge } from "@/components/live-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function LiveStreamCard({ stream }: { stream: LiveStreamView }) {
  return (
    <Link
      href={`/live/${stream.roomName}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-colors hover:border-live/50"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-secondary">
        {stream.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stream.cover || "/placeholder.svg"}
            alt={stream.title}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-secondary to-background">
            <Radio className="size-10 text-muted-foreground" />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <LiveBadge />
        </div>
        <div className="absolute right-2 top-2">
          <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white ring-1 ring-inset ring-white/15 backdrop-blur-sm">
            {stream.mode === "video" ? <Video className="size-3" /> : <Mic className="size-3" />}
            {stream.mode === "video" ? "Video" : "Audio"}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="font-semibold leading-tight text-balance transition-colors group-hover:text-live">
          {stream.title}
        </h3>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Avatar className="size-6">
            <AvatarFallback className="bg-secondary text-[10px]">{initials(stream.hostName)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-xs text-muted-foreground">{stream.hostName}</span>
        </div>
      </div>
    </Link>
  )
}
