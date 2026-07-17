import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { BibleReader } from "@/components/bible-reader"
import { getCurrentUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Bible — Frequency",
  description: "Read the Bible for free, book by book, in the public-domain King James Version.",
}

export default async function BiblePage() {
  // Highlights and notes save to the reader's account; signed-out readers keep
  // the offline localStorage highlights and are prompted to sign in for notes.
  const currentUser = await getCurrentUser()
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <BibleReader signedIn={!!currentUser} />
        </div>
      </main>
    </div>
  )
}
