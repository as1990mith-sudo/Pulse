import { Clock, Calendar } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { DevotionalInteractions } from "@/components/devotional-interactions"
import { dailyDevotional } from "@/lib/data"
import { getDevotionalComments } from "@/app/actions/devotional"
import { getCurrentUser } from "@/lib/session"

export default async function DevotionalPage() {
  const d = dailyDevotional
  const [comments, currentUser] = await Promise.all([getDevotionalComments(d.date), getCurrentUser()])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <img
            src={d.cover || "/placeholder.svg"}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/50" />
          <div className="relative mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 md:py-20">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                <Calendar className="size-4" /> Daily Devotional
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" /> {d.readingMinutes} min read
              </span>
              <span>{d.date}</span>
            </div>
            <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl">{d.title}</h1>
          </div>
        </section>

        <article className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12 sm:px-6">
          <blockquote className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
            <p className="text-pretty text-xl font-medium leading-relaxed sm:text-2xl">{`"${d.verse}"`}</p>
            <footer className="mt-3 text-sm font-semibold uppercase tracking-wider text-primary">{d.verseRef}</footer>
          </blockquote>

          <div className="space-y-5">
            {d.body.map((paragraph, i) => (
              <p key={i} className="text-pretty text-base leading-relaxed text-foreground/90 sm:text-lg">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">A prayer for today</h2>
            <p className="mt-3 text-pretty text-base leading-relaxed text-foreground/90 sm:text-lg">{d.prayer}</p>
          </div>

          <DevotionalInteractions
            title={d.title}
            devotionalDate={d.date}
            initialLikes={d.initialLikes}
            comments={comments}
            currentUser={currentUser}
          />
        </article>
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
