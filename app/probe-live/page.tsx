import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { LiveStreamView } from "@/app/actions/live"
import { SiteHeader } from "@/components/site-header"
import { AudienceCountsProvider } from "@/components/live/audience-counts"
import { BroadcastRow, CompactBroadcast, FeaturedBroadcast } from "@/components/live/broadcast-tiles"
import { LiveHero } from "@/components/live/live-hero"
import { StartLiveDock } from "@/components/live/start-live-dock"

// TEMPORARY verification-only route. Mirrors app/live/page.tsx exactly but with
// sample data, so the populated state can be inspected without writing rows to
// the database. Deleted once verified.

function s(over: Partial<LiveStreamView> & { roomName: string; title: string }): LiveStreamView {
  return {
    id: 1,
    hostId: "u1",
    hostName: "Marcus Bell",
    hostHandle: "marcus",
    category: "Faith",
    cover: null,
    mode: "audio",
    orientation: "portrait",
    layout: "podcast",
    topic: null,
    visibility: "public",
    startedAt: new Date().toISOString(),
    ...over,
  } as LiveStreamView
}

const streams: LiveStreamView[] = [
  s({
    roomName: "kingdom-connect",
    title: "Kingdom Connect",
    mode: "video",
    cover: "/_probe/cover-1.png",
    topic: "Midweek teaching on standing firm when the ground keeps moving.",
    hostName: "Marcus Bell",
  }),
  s({
    roomName: "faith-unplugged",
    title: "Faith Unplugged",
    mode: "video",
    cover: "/_probe/cover-2.png",
    topic: "Unscripted conversations about doubt.",
    hostName: "Ama Osei",
  }),
  s({
    roomName: "prayer-room",
    title: "The Prayer Room",
    mode: "audio",
    cover: "/_probe/cover-3.png",
    topic: "Open intercession. Come as you are.",
    hostName: "Grace Adeyemi",
  }),
  s({
    roomName: "leaders-roundtable",
    title: "Leaders' Roundtable",
    mode: "audio",
    cover: null,
    topic: "Shepherding without burning out.",
    hostName: "David Nkemelu",
  }),
  s({
    roomName: "open-conversation",
    title: "Open Conversation",
    mode: "audio",
    cover: "/_probe/cover-2.png",
    topic: "Anything on your heart",
    hostName: "Tolu Bankole",
  }),
  s({
    roomName: "morning-word",
    title: "The Morning Word",
    mode: "audio",
    cover: null,
    topic: "Ten minutes in the Psalms",
    hostName: "Ruth Mensah",
  }),
]

const counts: Record<string, number> = {
  "kingdom-connect": 1284,
  "faith-unplugged": 213,
  "prayer-room": 47,
  "leaders-roundtable": 0,
  "open-conversation": 12_400,
  "morning-word": 6,
}

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

export default function ProbeLive() {
  const featured = streams[0]
  const rail = streams.slice(1, 5)
  const tail = streams.slice(5)

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader />
      <AudienceCountsProvider roomNames={[]} initial={counts}>
        <main className="mx-auto w-full max-w-2xl">
          <LiveHero count={streams.length} />

          <div className="px-5">
            <FeaturedBroadcast stream={featured} />
          </div>

          <section className="mt-9">
            <SectionHead label="Also on air" href="/live/browse" />
            <div className="hscroll mt-3 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-1">
              {rail.map((x) => (
                <CompactBroadcast key={x.roomName} stream={x} />
              ))}
            </div>
          </section>

          <section className="mt-9">
            <SectionHead label="More signals" />
            <div className="mt-1 divide-y divide-foreground/8 px-5">
              {tail.map((x) => (
                <BroadcastRow key={x.roomName} stream={x} />
              ))}
            </div>
          </section>

          <div className="px-5 pb-4 pt-9">
            <StartLiveDock canGoLive />
          </div>
        </main>
      </AudienceCountsProvider>
    </div>
  )
}
