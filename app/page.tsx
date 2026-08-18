import Link from "next/link"
import { Clock, Calendar, BookHeart, Quote, Plus, Pencil } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { DevotionalInteractions } from "@/components/devotional-interactions"
import { Button } from "@/components/ui/button"
import { getLatestDevotional } from "@/lib/content"
import { getDevotionalComments } from "@/app/actions/devotional"
import { getCurrentUser } from "@/lib/session"
import { getActiveHomeContext } from "@/lib/home/active-home"
import { homeRoleHasPermission } from "@/lib/home/roles"
import { HomeEntry } from "@/components/home/onboarding/home-entry"

/** Formats the devotional's publish date as e.g. "Jun 20, 2026"; returns "" if unparseable. */
function formatPublishedDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default async function DevotionalPage() {
  const currentUser = await getCurrentUser()

  // Frequency Home front door: without an active Home there is no public feed —
  // the viewer is guided to set up or join a Home (spec §3). Once inside a Home,
  // the root shows that Home's landing (its Daily Devotional), scoped to its
  // organisation context.
  const { home, membership } = await getActiveHomeContext()
  if (!home) {
    return <HomeEntry signedIn={!!currentUser} />
  }

  // Whether this viewer may manage the Home's content. Admins decide exactly
  // which devotional their members see — so they get publish/manage affordances
  // right on the landing, while members simply read what the admin posts.
  const canManage = homeRoleHasPermission(membership?.role, "content.manage")
  const manageHref = `/org/${home.handle}/admin/content`

  const d = await getLatestDevotional(home.id)

  if (!d) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-24 text-center sm:px-6">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <BookHeart className="size-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">No devotional yet</h1>
          {canManage ? (
            <>
              <p className="max-w-md text-pretty text-muted-foreground">
                You decide what {home.name} reads. Publish your first Daily Devotional and it appears here for your
                members — never on the Frequency Universal app.
              </p>
              <Button render={<Link href={manageHref} />} nativeButton={false} className="mt-2 gap-2">
                <Plus className="size-4" />
                Publish a devotional
              </Button>
            </>
          ) : (
            <p className="max-w-md text-pretty text-muted-foreground">
              {home.name}&apos;s daily devotional will appear here as soon as an admin publishes one.
            </p>
          )}
        </main>
      </div>
    )
  }

  const comments = await getDevotionalComments(d.date)
  const publishedDate = formatPublishedDate(d.date)

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 sm:px-6">
        {/* Premium, compact hero card: the cover art sits inside a rounded
            frame with a soft gradient, keeping the fold tight while feeling
            crafted rather than a full-bleed banner. */}
        <section className="relative overflow-hidden rounded-3xl border border-border/60 shadow-sm">
          <img
            src={d.cover || "/placeholder.svg"}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
          <div className="relative flex flex-col gap-4 p-6 pt-24 sm:p-8 sm:pt-32">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                <Calendar className="size-3.5" /> Daily Devotional
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Clock className="size-3.5" /> {d.readingMinutes} min read
              </span>
              {canManage && (
                <Link
                  href={manageHref}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
                >
                  <Pencil className="size-3.5" /> Manage
                </Link>
              )}
            </div>
            <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{d.title}</h1>
            {publishedDate && <p className="text-sm text-muted-foreground">{publishedDate}</p>}
          </div>
        </section>

        <article className="mt-8 space-y-8">
          {/* Scripture pull-quote with a large decorative quote mark. */}
          <blockquote className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 sm:p-7">
            <Quote className="absolute -right-2 -top-2 size-20 text-primary/10" aria-hidden="true" />
            <p className="relative text-pretty text-xl font-medium leading-relaxed sm:text-2xl">{`"${d.verse}"`}</p>
            <footer className="relative mt-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
              <span className="h-px w-6 bg-primary/40" aria-hidden="true" />
              {d.verseRef}
            </footer>
          </blockquote>

          {/* Reading column: left-aligned, roomy line-height and a drop cap on
              the opening paragraph for a refined, easy-to-read flow. */}
          <div className="space-y-5">
            {d.body.map((paragraph, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "text-pretty text-[1.0625rem] leading-8 text-foreground first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-6xl first-letter:font-bold first-letter:leading-[0.8] first-letter:text-primary sm:text-lg"
                    : "text-pretty text-[1.0625rem] leading-8 text-foreground sm:text-lg"
                }
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Prayer callout. */}
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:p-7">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <BookHeart className="size-4" /> A prayer for today
            </h2>
            <p className="mt-3 text-pretty text-[1.0625rem] leading-8 text-foreground sm:text-lg">
              {d.prayer}
            </p>
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
