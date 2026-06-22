import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, MessageSquare } from "lucide-react"
import { getLiveStream } from "@/app/actions/live"
import { getFollowingIds } from "@/app/actions/follow"
import { resolveShow } from "@/lib/content"
import { getCurrentUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { LiveListener } from "@/components/live-listener"
import { LiveVideoViewer } from "@/components/live-video-viewer"
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

  // Video streams use the immersive, full-screen TikTok-style viewer.
  if (stream.mode === "video") {
    const followingIds = currentUser ? await getFollowingIds() : []
    return (
      <LiveVideoViewer
        stream={stream}
        canWatch={Boolean(currentUser)}
        currentUserId={currentUser?.id ?? null}
        initialFollowing={followingIds.includes(stream.hostId)}
      />
    )
  }

  return (
    // Mobile: a fully immersive, edge-to-edge audio room (no page chrome or
    // card borders) with the chat opening as a slide-up sheet from inside the
    // player. Desktop: the familiar two-column layout with a sticky chat rail.
    <div className="h-[100dvh] lg:flex lg:h-auto lg:min-h-screen lg:flex-col">
      <div className="hidden lg:block">
        <SiteHeader />
      </div>
      <main className="mx-auto h-full w-full max-w-6xl lg:flex-1 lg:px-6 lg:py-4">
        <Link
          href="/live"
          className="mb-3 hidden items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
        >
          <ArrowLeft className="size-4" /> Back to all shows
        </Link>

        <div className="h-full lg:grid lg:gap-4 lg:grid-cols-[1fr_360px]">
          {/* Main column — fills the whole screen on mobile */}
          <div className="h-full lg:h-auto">
            <LiveListener
              stream={stream}
              canListen={Boolean(currentUser)}
              currentUser={currentUser}
              currentUserId={currentUser?.id ?? null}
            />
          </div>

          {/* Chat sidebar — desktop only; mobile uses the in-player chat sheet */}
          <aside
            id="live-chat"
            className="hidden lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col"
          >
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card">
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
