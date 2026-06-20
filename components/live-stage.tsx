"use client"

import { Crown, Mic, MicOff, Phone, Plus, Signal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getInitials } from "@/lib/identity"
import type { ConnQuality, LiveParticipant } from "@/lib/use-live-audio"

export const MAX_GUESTS = 3

export type StageHost = {
  id: string
  name: string
  color: string
}

type StageSlot = {
  identity: string
  name: string
  color: string
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
      className="absolute -left-1 -top-1 flex items-end gap-px rounded-full border-2 border-card bg-card/90 p-1"
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
 * The shared "stage" shown to both host and listeners: one host tile plus three
 * guest tiles. Live participants (with publish permission) fill the slots in
 * order; empty guest slots render a call-in affordance.
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

  // The host occupies their own tile; everyone else with publish permission is
  // a guest. De-dupe the host out of the guest list defensively.
  const guests = speakers.filter((s) => s.identity !== host.id).slice(0, MAX_GUESTS)
  const hostLive = speakers.find((s) => s.identity === host.id)
  const emptySlots = Math.max(0, MAX_GUESTS - guests.length)

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4">
      {/* Host tile */}
      <StageTile
        slot={{
          identity: host.id,
          name: host.name,
          color: host.color,
          isSpeaking: active.has(host.id),
          isLocal: isHost,
          muted: false,
          quality: hostLive?.quality ?? hostQuality,
        }}
        role="Host"
      />

      {/* Filled guest tiles */}
      {guests.map((g) => (
        <StageTile
          key={g.identity}
          slot={{
            identity: g.identity,
            name: g.name,
            color: hostColorById[g.identity] ?? "bg-muted text-foreground",
            isSpeaking: active.has(g.identity),
            isLocal: g.isLocal,
            muted: mutedIds.has(g.identity),
            quality: g.quality,
          }}
          role="Guest"
          onRemove={isHost && onRemoveGuest ? () => onRemoveGuest(g.identity) : undefined}
        />
      ))}

      {/* Empty guest slots */}
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
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex items-center justify-center">
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
            "relative z-10 flex items-center justify-center rounded-full font-semibold transition-all duration-300",
            isHost ? "size-16 text-lg sm:size-20 sm:text-xl" : "size-14 text-base sm:size-16",
            slot.color,
            slot.isSpeaking
              ? "ring-[3px] ring-call-accept ring-offset-2 ring-offset-card shadow-lg shadow-call-accept/20"
              : "ring-1 ring-border/40",
          )}
        >
          {getInitials(slot.name)}
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
            "absolute -bottom-0.5 -right-0.5 z-20 flex size-5 items-center justify-center rounded-full border-2 border-card sm:size-6",
            slot.muted ? "bg-muted-foreground" : "bg-call-accept",
          )}
          aria-hidden="true"
        >
          {slot.muted ? <MicOff className="size-2.5 text-background" /> : <Mic className="size-2.5 text-background sm:size-3" />}
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

      <div className="flex items-center gap-1">
        <span className={cn("max-w-[5rem] truncate text-center text-xs font-medium", isHost && "sm:text-sm")}>
          {slot.isLocal ? "You" : slot.name}
        </span>
        {slot.isSpeaking && <SpeakingEq />}
      </div>
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-medium uppercase tracking-wide",
          isHost ? "bg-primary/15 text-primary" : "text-muted-foreground",
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
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        disabled={!canRequestCall || callPending}
        onClick={onRequestCall}
        aria-label={canRequestCall ? "Request to join as a guest" : "Empty guest seat"}
        className={cn(
          "flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border/70 text-muted-foreground transition-colors sm:size-16",
          canRequestCall && !callPending && "hover:border-call-accept hover:text-call-accept",
          !canRequestCall && "opacity-50",
        )}
      >
        {canRequestCall ? <Phone className="size-5" /> : <Plus className="size-5" />}
      </button>
      <span className="max-w-[5rem] truncate text-center text-xs font-medium text-muted-foreground">
        {callPending ? "Requested" : canRequestCall ? "Call in" : "Open"}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Guest</span>
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
