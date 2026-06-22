import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { DreamInterpretation } from "@/components/dream-interpretation"
import { getDreams } from "@/app/actions/dreams"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Dream Interpretation — Frequency",
  description: "Share your dreams anonymously and receive an interpretation.",
}

export default async function DreamInterpretationPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const initialFeed = await getDreams()

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <DreamInterpretation initialFeed={initialFeed} />
      </main>
    </div>
  )
}
