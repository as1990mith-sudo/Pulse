import { redirect } from "next/navigation"
import { CommunityHelp } from "@/components/community-help"
import { getCommunityPosts, getPublishableOrg } from "@/app/actions/community"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Community Help — Frequency",
  description: "Ask anything anonymously and get help from the Frequency community.",
}

export default async function CommunityHelpPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  // postAsOrg lets an org owner/admin publish a thread in the organisation's
  // voice; those threads surface on the org profile's Thread tab.
  const [initialPosts, postAsOrg] = await Promise.all([getCommunityPosts(), getPublishableOrg()])

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <CommunityHelp initialPosts={initialPosts} postAsOrg={postAsOrg} />
      </main>
    </div>
  )
}
