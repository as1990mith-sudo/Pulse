import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { DmInbox } from "@/components/dm-inbox"
import { getConversations } from "@/app/actions/dm"
import { getCurrentUser } from "@/lib/session"

export default async function MessagesPage() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
          <h1 className="text-2xl font-bold tracking-tight">Sign in to use messages</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Direct messages are private 1:1 conversations. Sign in to message other members.
          </p>
          <Link
            href="/sign-in"
            className="mt-6 inline-flex items-center rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </main>
      </div>
    )
  }

  const conversations = await getConversations()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl py-8">
        <DmInbox conversations={conversations} currentUser={currentUser} />
      </main>
    </div>
  )
}
