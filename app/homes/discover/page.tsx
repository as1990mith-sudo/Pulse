import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { getCurrentUser } from "@/lib/session"
import { FindAHomeView } from "@/components/home/find-a-home-view"

export const metadata: Metadata = {
  title: "Find a Home — Frequency",
  description: "Discover organisations and communities on Frequency, and join the ones that fit.",
}

export default async function FindAHomePage() {
  // Discovery is a signed-in surface: joining a Home requires an account, so a
  // guest is sent to sign in first and returned here afterwards.
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-2xl px-4 py-3">
          <FindAHomeView />
        </div>
      </main>
    </div>
  )
}
