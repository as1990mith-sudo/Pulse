"use client"

import { Crown, Mic, MicOff, Phone, Plus, Signal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getInitials } from "@/lib/identity"
import type { ConnQuality, LiveParticipant } from "@/lib/use-live-audio"

// Host + up to 3 guests = 4 tiles on stage, shown as a single compact row of 4.
export const MAX_GUESTS = 3

export type StageHost = {
  id: string
  name: string
  color: string
  image?: string | null
}

type StageSlot = {
  identity: string
  name: string
  color: string
  image: string | null
  isSpeaking: boolean
  isLocal: boolean
  muted: boolean
  quality: ConnQuality
}

/** Small signal indicator (3 bars) coloured by connection quality. */
function QualityBars({ quality }: { quality: ConnQuality }) {
  if (quality === "unknown") return null
  const level = quality === "excellent" ? 3 : quality === "good" ? 2 : 1
  const tone =
    quality === "poor" ? "bg-live" : quality === "good" ? "bg-primary" : "bg-call-accept"
  return (
    <span
      className="absolute -left-1 -top-1 flex items-end gap-px rounded-full border-2 border-zinc-950 bg-zinc-900/90 p-1"
      title={`Connection: ${quality}`}
      aria-label={`Connection quality: ${quality}`}
    >
      {[1, 2, 3].map((b) => (
        <span
          key={b}
          className={cn("w-0.5 rounded-full", b <= level ? tone : "bg-muted-foreground/30")}
          style={{ height: `${3 + b * 2}px` }}
        />
      ))}
    </span>
  )
}

/** Tiny equalizer that bounces while a speaker is talking. */
function SpeakingEq() {
  return (
    <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-0.5 origin-bottom rounded-full bg-call-accept-foreground animate-eq-bounce"
          style={{ height: "100%", animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  )
}

/**
 * The shared "stage" shown to both host and listeners as a tidy single row of
 * 4 tiles. The first tile is always the host; the remaining 3 are guests,
 * filled in order with empty seats rendering a call-in affordance (the first
 * open seat for eligible listeners).
 */
export function LiveStage({
  host,
  speakers,
  activeSpeakers,
  hostColorById = {},
  hostQuality = "unknown",
  isHost = false,
  canRequestCall = false,
  callPending = false,
  mutedIds = new Set<string>(),
  onRequestCall,
  onRemoveGuest,
}: {
  host: StageHost
  speakers: LiveParticipant[]
  activeSpeakers: string[]
  hostColorById?: Record<string, string>
  hostQuality?: ConnQuality
  isHost?: boolean
  canRequestCall?: boolean
  callPending?: boolean
  mutedIds?: Set<string>
  onRequestCall?: () => void
  onRemoveGuest?: (identity: string) => void
}) {
  const active = new Set(activeSpeakers)

  // The host always occupies the first tile; everyone else with publish
  // permission is a guest. De-dupe the host out of the guest list defensively.
  const guests = speakers.filter((s) => s.identity !== host.id).slice(0, MAX_GUESTS)
  const hostLive = speakers.find((s) => s.identity === host.id)
  // Fill the remaining guest seats (up to 3) with open slots so the stage
  // always reads as a neat single row of 4.
  const emptySlots = Math.max(0, MAX_GUESTS - guests.length)

  return (
    <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-x-2 sm:gap-x-3">
      {/* Host tile — first slot, audio-reactive, crowned. */}
      <StageTile
        slot={{
          identity: host.id,
          name: host.name,
          color: host.color,
          image: hostLive?.image ?? host.image ?? null,
          isSpeaking: active.has(host.id),
          isLocal: isHost,
          muted: false,
          quality: hostLive?.quality ?? hostQuality,
        }}
        role="Host"
      />

      {guests.map((g) => (
        <StageTile
          key={g.identity}
          slot={{
            identity: g.identity,
            name: g.name,
            color: hostColorById[g.identity] ?? "bg-muted text-foreground",
            image: g.image,
            isSpeaking: active.has(g.identity),
            isLocal: g.isLocal,
            muted: mutedIds.has(g.identity),
            quality: g.quality,
          }}
          role="Guest"
          onRemove={isHost && onRemoveGuest ? () => onRemoveGuest(g.identity) : undefined}
        />
      ))}

      {Array.from({ length: emptySlots }).map((_, i) => (
        <EmptySlot
          key={`empty-${i}`}
          canRequestCall={canRequestCall && i === 0}
          callPending={callPending && i === 0}
          onRequestCall={onRequestCall}
        />
      ))}
    </div>
  )
}

function StageTile({
  slot,
  role,
  onRemove,
}: {
  slot: StageSlot
  role: "Host" | "Guest"
  onRemove?: () => void
}) {
  const isHost = role === "Host"
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-2xl border border-white/15 bg-zinc-900 px-1 py-3 shadow-lg shadow-black/30 transition-colors",
        slot.isSpeaking && "border-call-accept/60 bg-call-accept/10",
        !isHost && "speaker-in",
      )}
    >
      <div className="relative flex items-center justify-center">
        {/* Soft breathing glow behind a speaking avatar. */}
        {slot.isSpeaking && (
          <span
            className="speaking-glow pointer-events-none absolute -inset-3 rounded-full bg-call-accept/30 blur-xl"
            aria-hidden="true"
          />
        )}
        {/* Talking ripple rings (only while speaking). */}
        {slot.isSpeaking && (
          <>
            <span className="audio-ring pointer-events-none absolute inset-0 rounded-full bg-call-accept/40" aria-hidden="true" />
            <span
              className="audio-ring pointer-events-none absolute inset-0 rounded-full bg-call-accept/30"
              style={{ animationDelay: "0.5s" }}
              aria-hidden="true"
            />
          </>
        )}

        <span
          className={cn(
            "relative z-10 flex size-12 items-center justify-center overflow-hidden rounded-full text-sm font-semibold transition-all duration-300 sm:size-14 sm:text-base",
            slot.color,
            slot.isSpeaking
              ? "ring-[3px] ring-call-accept ring-offset-2 ring-offset-zinc-950 shadow-lg shadow-call-accept/20"
              : "ring-2 ring-white/20",
          )}
        >
          {slot.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slot.image || "/placeholder.svg"} alt={slot.name} className="size-full object-cover" />
          ) : (
            getInitials(slot.name)
          )}
        </span>

        {/* Host crown badge */}
        {isHost && (
          <span
            className="absolute -top-1.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground shadow"
            aria-hidden="true"
          >
            <Crown className="size-2.5" /> Host
          </span>
        )}

        {/* Connection quality (top-left). */}
        <QualityBars quality={slot.quality} />

        {/* Mic status pill (bottom-right). */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 z-20 flex size-5 items-center justify-center rounded-full border-2 border-zinc-950",
            slot.muted ? "bg-muted-foreground" : "bg-call-accept",
          )}
          aria-hidden="true"
        >
          {slot.muted ? <MicOff className="size-2.5 text-background" /> : <Mic className="size-2.5 text-background" />}
        </span>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${slot.name} from stage`}
            className="absolute -right-1 -top-1 z-20 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow transition-transform hover:scale-110"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* The host's name is intentionally omitted (their crown + role badge
          already identify them); guests keep their name for context. */}
      {!isHost && (
        <div className="flex max-w-full items-center gap-0.5">
          <span className="max-w-[4.5rem] truncate text-center text-xs font-semibold text-white">
            {slot.isLocal ? "You" : slot.name}
          </span>
          {slot.isSpeaking && <SpeakingEq />}
        </div>
      )}
      <span
        className={cn(
          "rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wide",
          isHost ? "bg-primary/20 text-primary" : "text-white/55",
        )}
      >
        {role}
      </span>
    </div>
  )
}

function EmptySlot({
  canRequestCall,
  callPending,
  onRequestCall,
}: {
  canRequestCall: boolean
  callPending: boolean
  onRequestCall?: () => void
}) {
  // Only show a label when the seat is actionable; a plain open seat stays
  // compact with just the solid slot + dashed call-in circle.
  const label = callPending ? "Requested" : canRequestCall ? "Call in" : null
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-zinc-900 px-1 py-3 shadow-lg shadow-black/30">
      <button
        type="button"
        disabled={!canRequestCall || callPending}
        onClick={onRequestCall}
        aria-label={canRequestCall ? "Request to join as a guest" : "Empty guest seat"}
        className={cn(
          "flex size-12 items-center justify-center rounded-full border-2 border-dashed border-white/30 text-white/50 transition-colors sm:size-14",
          canRequestCall && !callPending && "border-call-accept/70 text-call-accept hover:border-call-accept hover:bg-call-accept/10",
        )}
      >
        {canRequestCall ? <Phone className="size-5" strokeWidth={2.5} /> : <Plus className="size-5" strokeWidth={2.5} />}
      </button>
      {label && (
        <span className="max-w-[4.5rem] truncate text-center text-xs font-semibold text-white/60">{label}</span>
      )}
    </div>
  )
}

/** Reused in panels: a single signal icon coloured by quality. */
export function QualityIcon({ quality, className }: { quality: ConnQuality; className?: string }) {
  const tone =
    quality === "poor"
      ? "text-live"
      : quality === "good"
        ? "text-primary"
        : quality === "excellent"
          ? "text-call-accept"
          : "text-muted-foreground"
  return <Signal className={cn("size-3.5", tone, className)} aria-label={`Connection: ${quality}`} />
}
