import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { ChatroomBrowser } from "@/components/chatroom-browser"
import { getMyChatrooms, listDiscoverChatrooms } from "@/app/actions/chatroom"
import { getCurrentUser } from "@/lib/session"

export default async function ChatroomsPage() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
          <h1 className="text-2xl font-bold tracking-tight">Sign in to use chatrooms</h1>
          <p className="mt-2 text-muted-foreground leading-relaxed">
            Chatrooms are private group chats. Sign in to create a room, invite members, and join the conversation.
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

  const [rooms, discoverRooms] = await Promise.all([getMyChatrooms(), listDiscoverChatrooms()])

  return (
    // Warm, themed backdrop: a soft amber wash bleeding down from the top plus a
    // faint glow near the bottom, layered over the base background so the page
    // feels colorful and alive while staying easy on the eyes.
    <div className="relative min-h-screen bg-gradient-to-b from-primary/15 via-background to-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]"
      />
      <div className="relative">
        <SiteHeader />
        <main>
          {/* scroll-mt keeps the first promo card clear of the sticky,
              hide-on-scroll header when the page scrolls (e.g. as the mobile
              browser chrome shows/hides on this short page), so the top of the
              Community Help card is never pinned under the header. */}
          <div className="mx-auto w-full max-w-3xl px-4 py-8 [&>*]:scroll-mt-24 sm:px-6">
            <ChatroomBrowser rooms={rooms} discoverRooms={discoverRooms} />
          </div>
        </main>
      </div>
    </div>
  )
}
