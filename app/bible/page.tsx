import type { Metadata } from "next"
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
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <BibleReader />
        </div>
      </main>
    </div>
  )
}
