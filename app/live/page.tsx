import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { AudienceCountsProvider } from "@/components/live/audience-counts"
import { BroadcastRow, CompactBroadcast, FeaturedBroadcast } from "@/components/live/broadcast-tiles"
import { LiveHero } from "@/components/live/live-hero"
import { QuietAir } from "@/components/live/quiet-air"
import { StartLiveDock } from "@/components/live/start-live-dock"
import { SetUpHomeCta } from "@/components/live/set-up-home-cta"
import { getLiveAudienceCounts, getLiveStreams } from "@/app/actions/live"
import { canViewerGoLive } from "@/lib/home/active-home"

/** Small section heading + optional "see all" affordance. */
function SectionHead({ label, href }: { label: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{label}</h2>
      {href && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1 text-xs font-bold text-live transition-colors hover:text-live/80"
        >
          Browse all
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}

export default async function LivePage() {
  const [streams, canGoLive] = await Promise.all([getLiveStreams(), canViewerGoLive()])

  // Server-render the real listener counts so the first paint shows true numbers;
  // the provider then keeps them fresh from a single poller.
  const roomNames = streams.map((s) => s.roomName)
  const initialCounts = await getLiveAudienceCounts(roomNames)

  // Editorial curation rather than a uniform grid: the most recent broadcast
  // leads as the hero, the next few form a horizontal discovery rail, and any
  // remainder falls to slim rows. `getLiveStreams()` already orders by
  // `startedAt desc`, so "freshest on air" naturally becomes the lead.
  const featured = streams[0]
  const rail = streams.slice(1, 5)
  const tail = streams.slice(5)

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader />

      <AudienceCountsProvider roomNames={roomNames} initial={initialCounts}>
        <main className="mx-auto w-full max-w-2xl">
          {featured ? (
            <>
              <LiveHero count={streams.length} />

              <div className="px-5">
                <FeaturedBroadcast stream={featured} />
              </div>

              {rail.length > 0 && (
                <section className="mt-9">
                  <SectionHead label="Also on air" href="/live/browse" />
                  {/* Edge-to-edge rail: the first tile aligns with the page
                      gutter while the row still bleeds off the right edge, which
                      is what signals "this scrolls". `.hscroll` hides the bar and
                      contains only horizontal overscroll, so a vertical swipe
                      started on a tile still scrolls the page. */}
                  <div className="hscroll mt-3 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-1">
                    {rail.map((s) => (
                      <CompactBroadcast key={s.roomName} stream={s} />
                    ))}
                  </div>
                </section>
              )}

              {tail.length > 0 && (
                <section className="mt-9">
                  <SectionHead label="More signals" />
                  <div className="mt-1 divide-y divide-foreground/8 px-5">
                    {tail.map((s) => (
                      <BroadcastRow key={s.roomName} stream={s} />
                    ))}
                  </div>
                </section>
              )}

              {/* Keep /live/browse reachable when there's no rail to hang it off. */}
              {rail.length === 0 && tail.length === 0 && (
                <div className="mt-7">
                  <SectionHead label="Discover" href="/live/browse" />
                </div>
              )}
            </>
          ) : (
            <QuietAir canGoLive={canGoLive} />
          )}

          {/* Host controls. Sticky, so they ride above the bottom nav while the
              listing scrolls. Renders nothing for members. */}
          <div className="px-5 pb-4 pt-9">
            <StartLiveDock canGoLive={canGoLive} />
          </div>

          {/* Members (who can't yet host) get an inviting nudge to create their
              own Home at the very bottom of the tab. Hosts already have the dock
              above, so this is member-only. */}
          {!canGoLive && <SetUpHomeCta />}
        </main>
      </AudienceCountsProvider>
    </div>
  )
}
