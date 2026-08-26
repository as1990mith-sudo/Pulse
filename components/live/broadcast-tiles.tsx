import Link from "next/link"
import { ChevronRight, Mic, Radio, Video } from "lucide-react"
import type { LiveStreamView } from "@/app/actions/live"
import { AudienceChip, FeaturedAudience } from "@/components/live/audience-counts"
import { getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"



/**
 * A broadcast's one-line description. `topic` is the host's own "what this room
 * is about" line, so it's the truest description available; `category` is the
 * fallback so a tile is never left with an empty slot.
 */
function describe(stream: LiveStreamView): string | null {
  return stream.topic?.trim() || stream.category?.trim() || null
}

/** Pulsing on-air dot — the one motion cue every tile shares. */
function OnAirDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex size-1.5 shrink-0", className)}>
      <span className="animate-live-pulse absolute inset-0 rounded-full bg-current" />
      <span className="relative size-1.5 rounded-full bg-current" />
    </span>
  )
}

/** Audio/Video designation chip. */
function ModeChip({ mode, solid = false }: { mode: LiveStreamView["mode"]; solid?: boolean }) {
  const Icon = mode === "video" ? Video : Mic
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
        solid
          ? "bg-background/55 text-foreground ring-1 ring-inset ring-foreground/15 backdrop-blur-md"
          : "bg-foreground/8 text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {mode === "video" ? "Video" : "Audio"}
    </span>
  )
}

/** Host identity line: initials chip + name. */
function HostLine({ stream, className }: { stream: LiveStreamView; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/12 text-[10px] font-bold text-foreground/80">
        {getInitials(stream.hostName)}
      </span>
      <span className="truncate">{stream.hostName}</span>
    </span>
  )
}

/**
 * Cover artwork with a graceful fallback. Audio rooms always have a cover
 * (enforced at go-live), but a video room may not — so the fallback is a tinted
 * signal field rather than a grey box, keeping the broadcast feel intact.
 */
function Cover({ stream, className }: { stream: LiveStreamView; className?: string }) {
  if (stream.cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={stream.cover || "/placeholder.svg"}
        alt=""
        className={cn("size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]", className)}
      />
    )
  }
  return (
    <div
      className={cn(
        "flex size-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--live)_28%,transparent),transparent_70%)] bg-secondary",
        className,
      )}
    >
      <Radio className="size-8 text-foreground/25" />
    </div>
  )
}

/* ------------------------------------------------------------------------- */

/**
 * The lead broadcast — a streaming-service hero. Tall portrait crop so the cover
 * carries real presence on a phone, with the whole tile as ONE tap target: the
 * brief calls for tapping a card to open the meeting directly, so "Join live" is
 * a visual affordance rather than a nested button (which would be both an
 * accessibility problem and an ambiguous tap).
 */
export function FeaturedBroadcast({ stream }: { stream: LiveStreamView }) {
  const desc = describe(stream)
  return (
    <Link
      href={`/live/${stream.roomName}`}
      className="group relative block overflow-hidden rounded-[1.75rem] ring-1 ring-inset ring-foreground/10 transition-shadow duration-300 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--live)_35%,transparent),0_18px_50px_-20px_color-mix(in_oklab,var(--live)_45%,transparent)]"
    >
      <div className="relative aspect-[4/5] w-full sm:aspect-[16/10]">
        <Cover stream={stream} />
        {/* Two-stop scrim: a deep floor for the copy plus a lighter top wash so
            the badges stay legible over a bright cover. */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/70 to-transparent" />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-live px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-live-foreground shadow-lg shadow-live/30">
            <OnAirDot />
            Live
          </span>
          <ModeChip mode={stream.mode} solid />
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
          <h3 className="text-balance text-[clamp(1.5rem,7vw,2.25rem)] font-extrabold leading-[1.05] tracking-tight">
            {stream.title}
          </h3>

          {desc && <p className="line-clamp-2 text-pretty text-sm leading-relaxed text-foreground/70">{desc}</p>}

          <div className="flex items-center gap-2.5 text-xs text-foreground/70">
            <HostLine stream={stream} className="min-w-0 flex-1 font-medium" />
            <span className="size-1 shrink-0 rounded-full bg-foreground/25" />
            <FeaturedAudience roomName={stream.roomName} className="shrink-0 text-live" />
          </div>

          <span className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-live px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-live-foreground shadow-lg shadow-live/25 transition-transform duration-200 group-active:scale-[0.985]">
            Join live
            <ChevronRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}

/**
 * Secondary broadcast in the horizontal discovery rail. Landscape crop and a
 * much lighter treatment than the featured tile, so the hierarchy between "the
 * one we're leading with" and "also on air" is unmistakable.
 */
export function CompactBroadcast({ stream }: { stream: LiveStreamView }) {
  return (
    <Link
      href={`/live/${stream.roomName}`}
      className="group flex w-[15.5rem] shrink-0 snap-start flex-col gap-2.5"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl ring-1 ring-inset ring-foreground/10">
        <Cover stream={stream} />
        <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-transparent to-transparent" />
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-background/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-live ring-1 ring-inset ring-foreground/10 backdrop-blur-md">
          <OnAirDot />
          Live
        </span>
        <AudienceChip
          roomName={stream.roomName}
          className="absolute bottom-2.5 right-2.5 rounded-full bg-background/55 px-2 py-1 text-[10px] font-semibold text-foreground ring-1 ring-inset ring-foreground/10 backdrop-blur-md"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <h4 className="line-clamp-2 text-pretty text-sm font-bold leading-snug transition-colors group-hover:text-live">
          {stream.title}
        </h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HostLine stream={stream} className="min-w-0 flex-1" />
        </div>
      </div>
    </Link>
  )
}

/**
 * The lightest weight: a full-width row for the tail of the listing. Keeps long
 * lists scannable without repeating large artwork, and stops the page becoming a
 * grid of identical cards.
 */
export function BroadcastRow({ stream }: { stream: LiveStreamView }) {
  const desc = describe(stream)
  return (
    <Link
      href={`/live/${stream.roomName}`}
      className="group flex items-center gap-3.5 py-3.5 transition-opacity hover:opacity-90"
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-foreground/10">
        <Cover stream={stream} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-live">
            <OnAirDot />
            Live
          </span>
          <ModeChip mode={stream.mode} />
        </div>
        <h4 className="truncate text-sm font-bold leading-snug transition-colors group-hover:text-live">
          {stream.title}
        </h4>
        <p className="truncate text-xs text-muted-foreground">
          {stream.hostName}
          {desc ? ` · ${desc}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <AudienceChip roomName={stream.roomName} className="text-xs text-live" />
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}
