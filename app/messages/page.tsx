import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { MessagesHub } from "@/components/messages-hub"
import { getConversations } from "@/app/actions/dm"
import { getMyChatrooms, listDiscoverChatrooms } from "@/app/actions/chatroom"
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

  const [conversations, rooms, discoverRooms] = await Promise.all([
    getConversations(),
    getMyChatrooms(),
    listDiscoverChatrooms(),
  ])

  return (
    // Same warm themed backdrop as the standalone Chatrooms page so the two
    // experiences feel like one consistent, premium surface.
    <div className="relative min-h-screen bg-gradient-to-b from-primary/15 via-background to-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]"
      />
      <div className="relative">
        <SiteHeader />
        <main>
          <MessagesHub
            conversations={conversations}
            currentUser={currentUser}
            rooms={rooms}
            discoverRooms={discoverRooms}
          />
        </main>
      </div>
    </div>
  )
}
