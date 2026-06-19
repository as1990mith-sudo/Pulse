import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { FeaturedHero } from "@/components/featured-hero"
import { ShowCard } from "@/components/show-card"
import { liveShows, upcomingShows } from "@/lib/data"

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</span>
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-balance">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

export default function LivePage() {
  const featured = liveShows[0]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        {featured && <FeaturedHero show={featured} />}

        <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-16 sm:px-6">
          <section className="space-y-6">
            <SectionHeading
              eyebrow="On air"
              title="Live right now"
              description="Jump into a stream, drop into the chat, or request to call in."
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {liveShows.map((show) => (
                <ShowCard key={show.id} show={show} />
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <SectionHeading
              eyebrow="Coming up"
              title="Scheduled shows"
              description="Set a reminder and be in the room when the mics go live."
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingShows.map((show) => (
                <ShowCard key={show.id} show={show} />
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-12">
              <div className="max-w-xl space-y-2">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-balance">
                  Your audience is waiting. Go live.
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Open the studio, turn on your camera and mic, and start broadcasting to listeners in seconds. Manage
                  chat and call-ins all in one place.
                </p>
              </div>
              <Link
                href="/studio"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open the studio <ArrowRight className="size-4" />
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
