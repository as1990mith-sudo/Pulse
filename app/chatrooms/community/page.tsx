import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { CommunityHelp } from "@/components/community-help"
import { getCommunityPosts } from "@/app/actions/community"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Community Help — Frequency",
  description: "Ask anything anonymously and get help from the Frequency community.",
}

export default async function CommunityHelpPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  const initialPosts = await getCommunityPosts()

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <SiteHeader collapsible />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <CommunityHelp initialPosts={initialPosts} />
      </main>
    </div>
  )
}
