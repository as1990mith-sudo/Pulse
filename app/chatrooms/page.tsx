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
        <section className="border-b border-border/60 bg-card/40">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-10 sm:px-6 md:py-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Community</span>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Chatrooms</h1>
            <p className="text-pretty text-base text-muted-foreground leading-relaxed">
              Create a private group chat and invite others, or search for a room by name and request to join. Only
              members can see a room and its messages.
            </p>
          </div>
        </section>

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
