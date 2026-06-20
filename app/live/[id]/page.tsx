import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, MessageSquare } from "lucide-react"
import { getLiveStream } from "@/app/actions/live"
import { resolveShow } from "@/lib/content"
import { getCurrentUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { LiveListener } from "@/components/live-listener"
import { LiveChat } from "@/components/live-chat"
import { EpisodePage } from "@/components/episode-page"

export default async function LiveStreamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const stream = await getLiveStream(id)

  // Not live? It may be a published, on-demand episode (looked up by slug).
  if (!stream) {
    const show = await resolveShow(id)
    if (!show) notFound()
    return <EpisodePage show={show} />
  }

  const currentUser = await getCurrentUser()

  return (
    // On mobile the whole experience is pinned to the viewport height so the
    // listener controls + chat fit without scrolling the page (only the chat
    // message list scrolls). On desktop it reverts to the normal scroll layout.
    <div className="flex h-[100dvh] flex-col lg:block lg:h-auto lg:min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 py-3 sm:px-6 lg:block lg:flex-none lg:py-4">
        <Link
          href="/live"
          className="mb-2 inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground lg:mb-3"
        >
          <ArrowLeft className="size-4" /> Back to all shows
        </Link>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:flex-none lg:gap-4 lg:grid-cols-[1fr_360px]">
          {/* Main column */}
          <div className="shrink-0 lg:shrink">
            <LiveListener stream={stream} canListen={Boolean(currentUser)} currentUserId={currentUser?.id ?? null} />
          </div>

          {/* Chat sidebar — fills the remaining space on mobile, sticky on desktop */}
          <aside
            id="live-chat"
            className="flex min-h-0 flex-1 scroll-mt-20 flex-col lg:block lg:flex-none lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card lg:h-full lg:flex-none">
              <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
                <MessageSquare className="size-4 text-primary" />
                <h2 className="font-semibold">Live chat</h2>
              </div>
              <div className="min-h-0 flex-1">
                <LiveChat
                  currentUser={currentUser}
                  roomName={stream.roomName}
                  bgUrl={stream.chatBgUrl ?? null}
                  bgEffect={stream.chatBgEffect ?? "none"}
                />
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
