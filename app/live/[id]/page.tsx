import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, MessageSquare, Share2 } from "lucide-react"
import { getShow } from "@/lib/data"
import { getCurrentUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { StreamPlayer } from "@/components/stream-player"
import { LiveChat } from "@/components/live-chat"
import { CallInPanel } from "@/components/call-in-panel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const show = getShow(id)

  if (!show) notFound()

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
            <StreamPlayer show={show} />

            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <Badge variant="secondary">{show.category}</Badge>
                  <h1 className="text-2xl font-bold tracking-tight text-balance">{show.title}</h1>
                  <p className="text-muted-foreground">{show.tagline}</p>
                </div>
                <Button variant="secondary" className="gap-1.5">
                  <Share2 className="size-4" /> Share
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11">
                    <AvatarImage src={show.host.avatar || "/placeholder.svg"} alt={show.host.name} />
                    <AvatarFallback>{show.host.name[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold leading-none">{show.host.name}</p>
                    <p className="text-sm text-muted-foreground">{show.host.handle}</p>
                  </div>
                </div>
                <Button variant="outline">Follow</Button>
              </div>

              <p className="text-pretty leading-relaxed text-muted-foreground">{show.description}</p>

              <CallInPanel currentUser={currentUser} />
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
                <LiveChat currentUser={currentUser} />
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
