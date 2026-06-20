import type { Metadata } from "next"
import { BookOpen } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { BibleReader } from "@/components/bible-reader"

export const metadata: Metadata = {
  title: "Bible — Frequency",
  description: "Read the Bible for free, book by book, in the public-domain King James Version.",
}

export default function BiblePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="border-b border-border/60 bg-card/40">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-10 sm:px-6 md:py-12">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <BookOpen className="size-3.5" /> Scripture
            </span>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Read the Bible</h1>
            <p className="text-pretty text-base text-muted-foreground leading-relaxed">
              Choose any book and chapter to read. Free and always available — the complete King James Version.
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <BibleReader />
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>Frequency — live podcast streaming.</p>
          <p>Scripture: King James Version (public domain).</p>
        </div>
      </footer>
    </div>
  )
}
