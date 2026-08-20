import type { Metadata } from "next"
import { redirect } from "next/navigation"
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
        {/* Compact mobile canvas: premium negative space around a tight core. */}
        <div className="mx-auto w-full max-w-md px-4 py-3">
          <MyHomesView />
        </div>
      </main>
    </div>
  )
}
