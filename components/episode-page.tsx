import Link from "next/link"
import { ArrowLeft, Clock } from "lucide-react"
import type { Show } from "@/lib/data"
import { SiteHeader } from "@/components/site-header"
import { EpisodePlayer } from "@/components/episode-player"
import { EpisodeInteractions } from "@/components/episode-interactions"
import { getEpisodeComments } from "@/app/actions/episodes"
import { getCurrentUser } from "@/lib/session"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

/** Full page shown for a published, on-demand episode (a recorded session). */
export async function EpisodePage({ show }: { show: Show }) {
  const [currentUser, comments] = await Promise.all([
    getCurrentUser(),
    show.episodeId ? getEpisodeComments(show.episodeId) : Promise.resolve([]),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Link
          href="/live"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to all shows
        </Link>

        <div className="space-y-6">
          <EpisodePlayer show={show} />

          <EpisodeInteractions show={show} currentUser={currentUser} initialComments={comments} />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{show.category}</Badge>
              {show.duration && (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="size-3.5" /> {show.duration}
                </span>
              )}
              {show.publishedDate && <span className="text-sm text-muted-foreground">· {show.publishedDate}</span>}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-balance">{show.title}</h1>
            {show.tagline && <p className="text-pretty text-muted-foreground">{show.tagline}</p>}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
            <Avatar className="size-11">
              <AvatarFallback>{show.host.name[0]}</AvatarFallback>
            </Avatar>
            <Link href={`/u/${show.host.id}`} className="min-w-0">
              <p className="truncate font-semibold leading-none hover:underline">{show.host.name}</p>
              <p className="truncate text-sm text-muted-foreground">{show.host.handle}</p>
            </Link>
          </div>

          {show.description && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-card p-5">
              <h2 className="text-sm font-semibold">About this episode</h2>
              <p className="whitespace-pre-wrap text-pretty leading-relaxed text-muted-foreground">
                {show.description}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
