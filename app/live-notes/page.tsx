import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { getCurrentUser } from "@/lib/session"
import { getLiveNotes } from "@/app/actions/live-notes"
import { getPersonalNotes } from "@/app/actions/personal-notes"
import { NotesHub } from "@/components/notes-hub"

export const metadata: Metadata = {
  title: "Notes — Frequency",
}

export default async function NotesPage() {
  const currentUser = await getCurrentUser()
  const signedIn = !!currentUser
  const [liveGroups, personalNotes] = signedIn
    ? await Promise.all([getLiveNotes(), getPersonalNotes()])
    : [[], []]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <NotesHub initialLiveGroups={liveGroups} initialPersonalNotes={personalNotes} signedIn={signedIn} />
      </main>
    </div>
  )
}
