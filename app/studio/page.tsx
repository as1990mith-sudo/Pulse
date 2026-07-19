import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { HostStudioLauncher, HostVideoStudioLauncher, HostConversationLauncher } from "@/components/live-session"
import { getCurrentUser } from "@/lib/session"
import { getMyActiveStream, getMyActiveVideoStream } from "@/app/actions/live"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; layout?: string }>
}) {
  const currentUser = await getCurrentUser()
  const { mode, layout } = await searchParams
  const isVideo = mode === "video"
  const isConversation = mode !== "video" && layout === "conversation"

  // When signed in, the console owns the full viewport below the header so the
  // studio is compact and only the chat scrolls.
  if (currentUser) {
    // The video studio is now hosted at the app level (see LiveSessionProvider)
    // just like audio, so the host can minimise the broadcast into a persistent
    // mini-player and keep navigating. Resume an already-live video stream if
    // the host reopened the studio after minimising or signing back in.
    if (isVideo) {
      const activeVideo = await getMyActiveVideoStream()
      return <HostVideoStudioLauncher currentUser={currentUser} resumeStream={activeVideo} />
    }
    // The audio console is hosted at the app level (see LiveSessionProvider) so
    // the room can be minimised into a persistent mini-player while audio keeps
    // playing. If the host already has a stream live (e.g. reopened the studio
    // after signing back in), resume it instead of showing the offline setup.
    const activeStream = await getMyActiveStream()
    // Conversation is a distinct Audio-Live layout (community gathering) with
    // its own host setup + room UI. Resume a live conversation if one exists.
    if (isConversation || activeStream?.layout === "conversation") {
      return <HostConversationLauncher currentUser={currentUser} resumeStream={activeStream} />
    }
    return <HostStudioLauncher currentUser={currentUser} resumeStream={activeStream} />
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Host studio</span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-balance">Your control room</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Set your mic, add background music, go live, and manage the chat and call-in queue in real time.
          </p>
        </div>

        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-lg font-semibold">Sign in to host</p>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
            You need an account to go live, notify your followers, and publish your sessions to your profile.
          </p>
          <div className="flex gap-2">
            <Button render={<Link href="/sign-in" />} nativeButton={false}>
              Sign in
            </Button>
            <Button render={<Link href="/sign-up" />} nativeButton={false} variant="secondary">
              Create account
            </Button>
          </div>
        </Card>
      </main>
    </div>
  )
}
