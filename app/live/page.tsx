import Link from "next/link"
import { ChevronRight, Mic, Video } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { GoLiveHero } from "@/components/go-live-toggle"
import { getLiveStreams } from "@/app/actions/live"

/**
 * The full-width LIVE status pill at the top of the Live tab. Shows a pulsing
 * dot and a live count, and links straight into the browse experience.
 */
function LiveStatusPill({ count }: { count: number }) {
  const label =
    count === 0
      ? "No streams on air right now"
      : `${count} ${count === 1 ? "stream" : "streams"} on air right now`
  return (
    <Link
      href="/live/browse"
      className="group flex items-center gap-3 rounded-full border border-border/60 bg-card px-4 py-3 transition-colors hover:border-live/50 hover:bg-card/80 sm:px-5"
    >
      <span className="relative flex size-2.5 shrink-0 items-center justify-center">
        {count > 0 && (
          <span className="absolute inset-0 animate-ping rounded-full bg-live/70" aria-hidden="true" />
        )}
        <span className="relative size-2.5 rounded-full bg-live" />
      </span>
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-live">Live</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground sm:text-base">{label}</span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

/**
 * One channel card (Video / Audio) in the YOUR CHANNELS row. Uses a colored
 * top-edge glow + accent icon + accent "Browse shows" link, and deep-links into
 * the browse page pre-filtered to that show type.
 */
function ChannelCard({
  href,
  label,
  count,
  icon: Icon,
  accent,
}: {
  href: string
  label: string
  count: number
  icon: typeof Video
  accent: "video" | "audio"
}) {
  // Video → amber (--primary), Audio → red (--live). Both already in the theme.
  const isVideo = accent === "video"
  const accentText = isVideo ? "text-primary" : "text-live"
  const glow = isVideo
    ? "before:bg-[linear-gradient(90deg,transparent,var(--primary),transparent)]"
    : "before:bg-[linear-gradient(90deg,transparent,var(--live),transparent)]"

  return (
    <Link
      href={href}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card p-4 transition-colors hover:border-border sm:p-5
        before:absolute before:inset-x-4 before:top-0 before:h-px before:content-[''] ${glow}`}
    >
      <span
        className={`flex size-11 items-center justify-center rounded-2xl ${
          isVideo ? "bg-primary/15 text-primary" : "bg-live/15 text-live"
        }`}
      >
        <Icon className="size-5" />
      </span>

      <h3 className="mt-5 text-lg font-bold tracking-tight sm:text-xl">{label}</h3>

      <div className="mt-3 flex items-start gap-2 text-sm leading-snug text-muted-foreground">
        {count > 0 ? (
          <span className="tabular-nums">
            <span className="text-2xl font-bold text-foreground">{count}</span>{" "}
            {count === 1 ? "show live" : "shows live"}
          </span>
        ) : (
          <>
            <span className="mt-2 h-px w-4 shrink-0 bg-border" aria-hidden="true" />
            <span className="text-pretty">Nothing live. Start one below.</span>
          </>
        )}
      </div>

      <span className={`mt-6 flex items-center gap-1.5 text-sm font-bold ${accentText}`}>
        Browse shows
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

export default async function LivePage() {
  const streams = await getLiveStreams()
  const videoCount = streams.filter((s) => s.mode === "video").length
  const audioCount = streams.filter((s) => s.mode === "audio").length
  const totalCount = videoCount + audioCount

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-20 pt-5 sm:px-6">
          <LiveStatusPill count={totalCount} />

          <section className="space-y-3">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Your channels
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <ChannelCard
                href="/live/browse?type=video"
                label="Video shows"
                count={videoCount}
                icon={Video}
                accent="video"
              />
              <ChannelCard
                href="/live/browse?type=audio"
                label="Audio shows"
                count={audioCount}
                icon={Mic}
                accent="audio"
              />
            </div>
          </section>

          {/* Host CTA — the flagship "go live" panel. The id anchor lets the
              side menu's "Creator Studio" deep-link straight to it. scroll-mt
              clears the sticky header. */}
          <div id="go-live" className="scroll-mt-24">
            <GoLiveHero />
          </div>
        </div>
      </main>
    </div>
  )
}
