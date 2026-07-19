import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { getCurrentUser } from "@/lib/session"
import { getLiveNotes } from "@/app/actions/live-notes"
import { LiveNotesBrowser } from "@/components/live-notes-browser"

export const metadata: Metadata = {
  title: "Live Notes — Frequency",
  description: "Every note you captured during a live, gathered by host, topic, and date.",
}

export default async function LiveNotesPage() {
  const currentUser = await getCurrentUser()
  const groups = currentUser ? await getLiveNotes() : []

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <Link
            href="/"
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Back home
          </Link>

          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">Live Notes</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Everything you wrote during a live, saved automatically and grouped by host, topic, and date.
            </p>
          </header>

          <LiveNotesBrowser initialGroups={groups} signedIn={!!currentUser} />
        </div>
      </main>
    </div>
  )
}
