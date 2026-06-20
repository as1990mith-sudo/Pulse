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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

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
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Link
          href="/live"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to all shows
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Main column */}
          <div className="space-y-6">
            <LiveListener stream={stream} canListen={Boolean(currentUser)} currentUserId={currentUser?.id ?? null} />

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-3">
                <Avatar className="size-11">
                  <AvatarFallback>{stream.hostName[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold leading-none">{stream.hostName}</p>
                  <p className="text-sm text-muted-foreground">{stream.hostHandle}</p>
                </div>
              </div>
              {stream.category && <Badge variant="secondary">{stream.category}</Badge>}
            </div>
          </div>

          {/* Chat sidebar */}
          <aside className="lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
            <div className="flex h-[520px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card lg:h-full">
              <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
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
