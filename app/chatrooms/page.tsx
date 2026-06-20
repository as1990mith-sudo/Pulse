import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { ChatroomBrowser } from "@/components/chatroom-browser"
import { getMyChatrooms } from "@/app/actions/chatroom"
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

  const rooms = await getMyChatrooms()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <ChatroomBrowser rooms={rooms} />
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>Frequency — live podcast streaming.</p>
          <p>Chatrooms are private to their members.</p>
        </div>
      </footer>
    </div>
  )
}
