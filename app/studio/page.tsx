import { SiteHeader } from "@/components/site-header"
import { StudioConsole } from "@/components/studio-console"

export default function StudioPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Host studio</span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-balance">Your control room</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Set your camera and mic, go live, and manage the chat and call-in queue in real time.
          </p>
        </div>
        <StudioConsole />
      </main>
    </div>
  )
}
