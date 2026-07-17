import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { getCurrentUser } from "@/lib/session"
import { getBibleNotesList } from "@/app/actions/bible-notes"
import { BibleNotesList } from "@/components/bible/bible-notes-list"

export const metadata: Metadata = {
  title: "My Bible Notes — Frequency",
  description: "Every note you've written against a verse, gathered in one place.",
}

export default async function BibleNotesPage() {
  const currentUser = await getCurrentUser()
  const notes = currentUser ? await getBibleNotesList() : []

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <Link
            href="/bible"
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Back to reading
          </Link>

          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">My Notes</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Notes you&apos;ve written against verses, in the order of the books of the Bible.
            </p>
          </header>

          <BibleNotesList initialNotes={notes} signedIn={!!currentUser} />
        </div>
      </main>
    </div>
  )
}
