"use client"

import { Mic, MicOff, Phone, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getInitials } from "@/lib/identity"
import type { LiveParticipant } from "@/lib/use-live-audio"

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
}

/**
 * The shared "stage" shown to both host and listeners: one host tile plus three
 * guest tiles. Live participants (with publish permission) fill the slots in
 * order; empty guest slots render a call-in affordance.
 *
 * - `speakers` is the live roster from useLiveAudio (host + accepted guests).
 * - `activeSpeakers` are identities currently talking (drives the green ring).
 * - `onRequestCall` (listener) shows a call button on empty guest slots.
 * - `onRemoveGuest` (host) lets the host drop a guest back to the audience.
 */
export function LiveStage({
  host,
  speakers,
  activeSpeakers,
  hostColorById = {},
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
  const emptySlots = Math.max(0, MAX_GUESTS - guests.length)

  const hostSpeaking = active.has(host.id)

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {/* Host tile */}
      <StageTile
        slot={{
          identity: host.id,
          name: host.name,
          color: host.color,
          isSpeaking: hostSpeaking,
          isLocal: isHost,
          muted: false,
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
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full text-base font-semibold transition-shadow sm:size-16",
            slot.color,
            slot.isSpeaking && "ring-2 ring-live ring-offset-2 ring-offset-background",
          )}
        >
          {getInitials(slot.name)}
        </span>

        {/* Mic status pill */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background",
            slot.muted ? "bg-muted-foreground" : "bg-live",
          )}
          aria-hidden="true"
        >
          {slot.muted ? (
            <MicOff className="size-2.5 text-background" />
          ) : (
            <Mic className="size-2.5 text-background" />
          )}
        </span>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${slot.name} from stage`}
            className="absolute -left-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <span className="max-w-[4.5rem] truncate text-center text-xs font-medium">
        {slot.isLocal ? "You" : slot.name}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{role}</span>
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
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={!canRequestCall || callPending}
        onClick={onRequestCall}
        aria-label={canRequestCall ? "Request to join as a guest" : "Empty guest seat"}
        className={cn(
          "flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground transition-colors sm:size-16",
          canRequestCall && !callPending && "hover:border-live hover:text-live",
          !canRequestCall && "opacity-60",
        )}
      >
        {canRequestCall ? <Phone className="size-5" /> : <Plus className="size-5" />}
      </button>
      <span className="max-w-[4.5rem] truncate text-center text-xs font-medium text-muted-foreground">
        {callPending ? "Requested" : canRequestCall ? "Call in" : "Open"}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Guest</span>
    </div>
  )
}
