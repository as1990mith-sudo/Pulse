import Link from "next/link"
import type { Show } from "@/lib/data"
import { SiteHeader } from "@/components/site-header"
import { BackButton } from "@/components/back-button"
import { EpisodePlayer } from "@/components/episode-player"
import { EpisodeInteractions } from "@/components/episode-interactions"
import { EpisodeWatch } from "@/components/episode-watch"
import { VideoCard } from "@/components/profile/video-card"
import { getEpisodeComments } from "@/app/actions/episodes"
import { getEpisodesByUser } from "@/lib/content"
import { getCurrentUser } from "@/lib/session"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

/** Full page shown for a published, on-demand episode (a recorded session). */
export async function EpisodePage({ show }: { show: Show }) {
  const [currentUser, comments, creatorEpisodes] = await Promise.all([
    getCurrentUser(),
    show.episodeId ? getEpisodeComments(show.episodeId) : Promise.resolve([]),
    getEpisodesByUser(show.host.id),
  ])

  // "Up next" queue: the same creator's other video episodes (excluding this one).
  const queue = creatorEpisodes.filter((ep) => ep.mediaType === "video" && ep.id !== show.id)

  // Video episodes use the immersive, YouTube-style watch layout with a pinned
  // player + action bar and a single scroll container beneath it. Audio episodes
  // keep the classic scrolling page.
  if (show.videoUrl) {
    return <EpisodeWatch show={show} currentUser={currentUser} initialComments={comments} queue={queue} />
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl py-6">
        <BackButton fallbackHref="/live" className="mb-5 px-4 sm:px-6" />

        {/* The player is rendered edge-to-edge (no horizontal padding) so the
            video bleeds from one screen edge to the other. */}
        <EpisodePlayer show={show} />

        <div className="space-y-6 px-4 pt-6 sm:px-6">
          <EpisodeInteractions show={show} currentUser={currentUser} initialComments={comments} />

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

          {/* Up next: the rest of this creator's video episodes, queued below. */}
          {queue.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">More from {show.host.name}</h2>
              <div className="flex flex-col gap-3">
                {queue.map((ep) => (
                  <VideoCard key={ep.id} show={ep} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
