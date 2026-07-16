import { Radio } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { LiveStreamCard } from "@/components/live-stream-card"
import { LiveBadge } from "@/components/live-badge"
import { GoLiveToggle } from "@/components/go-live-toggle"
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
  const streams = await getLiveStreams()
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

          {/* Host CTA — pick audio or video, then open the studio in that mode.
              The id anchor lets "Creator Studio" in the side menu deep-link
              straight down to this go-live selector. scroll-mt clears the
              sticky header so the section isn't hidden beneath it. */}
          <div id="go-live" className="scroll-mt-24">
            <GoLiveToggle />
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>Real-time audio powered by WebRTC.</p>
        </div>
      </footer>
    </div>
  )
}
