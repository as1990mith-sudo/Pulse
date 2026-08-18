import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { getCurrentUser } from "@/lib/session"
import { MyHomesView } from "@/components/home/my-homes-view"

export const metadata: Metadata = {
  title: "My Homes — Frequency",
  description: "Switch between the Homes you belong to, or join and set up new ones.",
}

export default async function MyHomesPage() {
  // My Homes is a signed-in surface. Send guests to sign in first.
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
          <Link
            href="/"
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Back home
          </Link>

          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">My Homes</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Switch between the Homes you belong to, or join and set up new ones.
            </p>
          </header>

          <MyHomesView />
        </div>
      </main>
    </div>
  )
}
