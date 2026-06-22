import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { StudioConsole } from "@/components/studio-console"
import { VideoStudioConsole } from "@/components/video-studio-console"
import { StudioErrorBoundary } from "@/components/studio-error-boundary"
import { getCurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const currentUser = await getCurrentUser()
  const { mode } = await searchParams
  const isVideo = mode === "video"

  // When signed in, the console owns the full viewport below the header so the
  // studio is compact and only the chat scrolls.
  if (currentUser) {
    // Video studio is a full-bleed, immersive surface (its own header chrome).
    if (isVideo) {
      return (
        <StudioErrorBoundary>
          <VideoStudioConsole currentUser={currentUser} />
        </StudioErrorBoundary>
      )
    }
    // The audio console is a full-bleed, immersive surface (its own header
    // chrome), mirroring the listener experience — no global SiteHeader.
    return (
      <StudioErrorBoundary>
        <div className="flex h-dvh flex-col overflow-hidden">
          <StudioConsole currentUser={currentUser} />
        </div>
      </StudioErrorBoundary>
    )
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
