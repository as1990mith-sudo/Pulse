import Link from "next/link"
import { ArrowRight, Headphones, Library, Mic, Radio } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { ShowCard } from "@/components/show-card"
import { LiveStreamCard } from "@/components/live-stream-card"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { LiveBadge } from "@/components/live-badge"
import { upcomingShows } from "@/lib/data"
import { getCatalogEpisodes } from "@/lib/content"
import { getLiveStreams } from "@/app/actions/live"

function SectionHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string
  title: string
  description: string
  icon?: typeof Radio
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-live">
        {Icon && <Icon className="size-3.5" />}
        {eyebrow}
      </span>
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-balance">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

export default async function LivePage() {
  const [streams, episodes] = await Promise.all([getLiveStreams(), getCatalogEpisodes()])
  const liveCount = streams.length

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        {/* Live now */}
        <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-16 sm:px-6">
          <section className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                eyebrow="On air"
                icon={Radio}
                title="Live right now"
                description="Jump into a stream and listen in real time, or open the studio to start your own."
              />
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm font-medium">
                <LiveBadge />
                {liveCount} {liveCount === 1 ? "show" : "shows"} streaming
              </span>
            </div>
            {streams.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
                {streams.map((stream) => (
                  <LiveStreamCard key={stream.id} stream={stream} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No one is live right now. Be the first — open the studio and go on air.
                </p>
              </div>
            )}
          </section>

          {/* Coming up */}
          {upcomingShows.length > 0 && (
            <section className="space-y-6">
              <SectionHeading
                eyebrow="Coming up"
                icon={Mic}
                title="Scheduled shows"
                description="Set a reminder and be in the room when the mics go live."
              />
              <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
                {upcomingShows.map((show) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            </section>
          )}

          {/* On demand library (merged catalogue) */}
          <section id="library" className="space-y-6">
            <SectionHeading
              eyebrow="On demand"
              icon={Library}
              title="Episode library"
              description="Every recorded live show, ready when you are. Filter by category to find your next listen."
            />
            <EpisodeCatalog episodes={episodes} />
          </section>

          {/* Host CTA */}
          <section className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-12">
              <div className="max-w-xl space-y-2">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-balance">
                  Your audience is waiting. Go live.
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Open the studio, turn on your mic, add background music, and start broadcasting audio to listeners in
                  seconds. Manage chat and call-ins all in one place.
                </p>
              </div>
              <Link
                href="/studio"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-live px-6 py-3 font-medium text-live-foreground transition-opacity hover:opacity-90"
              >
                <Headphones className="size-4" /> Open the studio <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>Frequency — live podcast streaming.</p>
          <p>Real-time audio powered by WebRTC.</p>
        </div>
      </footer>
    </div>
  )
}
