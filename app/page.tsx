import Link from "next/link"
import { Clock, Calendar, BookHeart, ShoppingCart } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { DevotionalInteractions } from "@/components/devotional-interactions"
import { Button } from "@/components/ui/button"
import { getLatestDevotional } from "@/lib/content"
import { devotionalSource } from "@/lib/data"
import { getDevotionalComments } from "@/app/actions/devotional"
import { getCurrentUser } from "@/lib/session"

export default async function DevotionalPage() {
  const d = await getLatestDevotional()
  const currentUser = await getCurrentUser()

  if (!d) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-24 text-center sm:px-6">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BookHeart className="size-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">No devotional yet</h1>
          <p className="max-w-md text-pretty text-muted-foreground">
            The latest weekly devotional will appear here as soon as it&apos;s published.
          </p>
        </main>
      </div>
    )
  }

  const comments = await getDevotionalComments(d.date)

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
                <Calendar className="size-4" /> Weekly Devotional
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" /> {d.readingMinutes} min read
              </span>
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
              <p key={i} className="text-base leading-relaxed text-foreground/90 hyphens-auto text-justify sm:text-lg">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">A prayer for today</h2>
            <p className="mt-3 text-base leading-relaxed text-foreground/90 hyphens-auto text-justify sm:text-lg">
              {d.prayer}
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookHeart className="size-5" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm text-muted-foreground">
                  Excerpt From{" "}
                  <span className="font-semibold text-foreground">{devotionalSource.name}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  by <span className="font-medium text-foreground">{devotionalSource.author}</span>
                </p>
              </div>
            </div>
            <Button
              render={<Link href={devotionalSource.orderUrl} target="_blank" rel="noopener noreferrer" />}
              nativeButton={false}
              className="shrink-0 gap-2"
            >
              <ShoppingCart className="size-4" />
              Order the devotional
            </Button>
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
    </div>
  )
}
