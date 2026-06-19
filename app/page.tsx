import Link from "next/link"
import { ArrowRight, Radio } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { LiveBadge } from "@/components/live-badge"
import { episodes, liveShows } from "@/lib/data"

export default function CatalogPage() {
  const liveCount = liveShows.length

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="border-b border-border/60 bg-card/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 md:py-16">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">On demand</span>
              <h1 className="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                Every episode, ready when you are
              </h1>
              <p className="max-w-xl text-pretty text-base text-muted-foreground leading-relaxed">
                Browse the full catalog of recorded live shows. Filter by category, switch to the YouTube-style view, and
                pick up right where the conversation left off.
              </p>
            </div>
            {liveCount > 0 && (
              <Link
                href="/live"
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-border/60 bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/60"
              >
                <LiveBadge />
                {liveCount} {liveCount === 1 ? "show is" : "shows are"} streaming live now
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            )}
          </div>
        </section>

        <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-12 sm:px-6">
          <section className="space-y-6">
            <EpisodeCatalog episodes={episodes} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-12">
              <div className="max-w-xl space-y-2">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-balance">
                  Want to catch a show as it happens?
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Head to the live page to join a stream in progress, drop into the chat, or request to call in on air.
                </p>
              </div>
              <Link
                href="/live"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Radio className="size-4" /> Go to live shows
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>Frequency — live podcast streaming.</p>
          <p>Built as a demo. Streaming is simulated.</p>
        </div>
      </footer>
    </div>
  )
}
