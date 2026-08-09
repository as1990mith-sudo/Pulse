import Link from "next/link"
import { ArrowLeft, Video, Mic } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { LiveBrowse } from "@/components/live-browse"
import { getLiveStreams, type LiveMode } from "@/app/actions/live"
import { cn } from "@/lib/utils"

export default async function LiveBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type: typeParam } = await searchParams
  const type: LiveMode = typeParam === "audio" ? "audio" : "video"

  const all = await getLiveStreams()
  const streams = all.filter((s) => s.mode === type)

  const tabs: { value: LiveMode; label: string; icon: typeof Video }[] = [
    { value: "video", label: "Video shows", icon: Video },
    { value: "audio", label: "Audio shows", icon: Mic },
  ]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
        <Link
          href="/live"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Live
        </Link>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-live">
              <span className="relative flex size-1.5 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-live/70" aria-hidden="true" />
                <span className="relative size-1.5 rounded-full bg-live" />
              </span>
              On air
            </span>
            <h1 className="text-xl font-bold tracking-tight text-balance sm:text-2xl">Ongoing live streams</h1>
            <p className="text-[13px] text-muted-foreground text-pretty">
              Browse everything live right now, or filter by category.
            </p>
          </div>

          {/* Show-type toggle — swaps the whole page between video and audio.
              Accent-aware to match the main Live tab: Video → amber (--primary),
              Audio → red (--live). */}
          <div className="inline-flex w-full gap-1 rounded-xl border border-border/60 bg-card p-1 sm:w-auto">
            {tabs.map((t) => {
              const active = t.value === type
              const isVideo = t.value === "video"
              const Icon = t.icon
              return (
                <Link
                  key={t.value}
                  href={`/live/browse?type=${t.value}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors sm:flex-none",
                    active
                      ? isVideo
                        ? "bg-primary text-primary-foreground"
                        : "bg-live text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4", !active && (isVideo ? "text-primary" : "text-live"))} />
                  {t.label}
                </Link>
              )
            })}
          </div>
        </div>

        <LiveBrowse streams={streams} type={type} />
      </main>
    </div>
  )
}
