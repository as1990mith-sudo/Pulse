import Link from "next/link"
import { Radio, Video, Mic, ArrowRight } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
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

/** A large entry card for one show type (video / audio) that deep-links into
    the browse page pre-filtered to that type, showing the current live count. */
function ShowTypeCard({
  href,
  label,
  description,
  count,
  icon: Icon,
  accent,
}: {
  href: string
  label: string
  description: string
  count: number
  icon: typeof Video
  accent: string
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:border-border sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`flex size-12 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="size-6" />
        </span>
        {count > 0 && <LiveBadge />}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-xl font-bold tracking-tight">{label}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium tabular-nums">
          <span className="text-2xl font-bold">{count}</span>{" "}
          <span className="text-muted-foreground">{count === 1 ? "show live" : "shows live"}</span>
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold text-primary">
          Browse
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

export default async function LivePage() {
  const streams = await getLiveStreams()
  const videoCount = streams.filter((s) => s.mode === "video").length
  const audioCount = streams.filter((s) => s.mode === "audio").length

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
              <Link
                href="/live/browse"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-border hover:bg-accent"
              >
                <LiveBadge />
                Check ongoing live streams
                <ArrowRight className="size-4" />
              </Link>
            </div>

            {/* Two entry points into the browse experience — one per show type. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
              <ShowTypeCard
                href="/live/browse?type=video"
                label="Video shows"
                description="Face-to-face rooms and video broadcasts happening live."
                count={videoCount}
                icon={Video}
                accent="bg-primary/15 text-primary"
              />
              <ShowTypeCard
                href="/live/browse?type=audio"
                label="Audio shows"
                description="Talk rooms and audio broadcasts you can drop into and listen."
                count={audioCount}
                icon={Mic}
                accent="bg-live/15 text-live"
              />
            </div>
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
