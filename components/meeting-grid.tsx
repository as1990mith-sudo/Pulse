"use client"

import { useEffect, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Mic,
  MicOff,
  Music,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react"
import type { RemotePeer } from "@/lib/use-live-video"
import { muteParticipant } from "@/app/actions/live"
import { cn } from "@/lib/utils"

// 2 columns × 4 rows = 8 tiles per page, like the plan specifies.
const TILES_PER_PAGE = 8

/** One participant in the meeting, unified for local + remote rendering. */
type Tile =
  | { kind: "local"; identity: string; name: string; image: string | null; isHost: boolean }
  | { kind: "remote"; peer: RemotePeer }

/**
 * Google Meet / Zoom-style meeting grid for a "Grid" video live. Every
 * participant has a tile from the moment they join. Renders a paginated 2×4
 * grid, the local self-view, and — for the host — per-tile mute / ask-to-unmute
 * controls plus an "Add track" (background music) button.
 */
export function MeetingGrid({
  roomName,
  isHost,
  self,
  peers,
  localVideoRef,
  registerPeerVideoEl,
  micOn,
  camOn,
  localVideoReady,
  onToggleMic,
  onToggleCam,
  onFlipCamera,
  onAskUnmute,
  onAddTrack,
  onLeave,
}: {
  roomName: string
  isHost: boolean
  self: { identity: string; name: string; image: string | null }
  peers: RemotePeer[]
  localVideoRef: React.RefObject<HTMLVideoElement | null>
  registerPeerVideoEl: (identity: string, el: HTMLVideoElement | null) => void
  micOn: boolean
  camOn: boolean
  localVideoReady: boolean
  onToggleMic: () => void
  onToggleCam: () => void
  onFlipCamera: () => void
  onAskUnmute: (identity: string) => void
  onAddTrack?: () => void
  onLeave: () => void
}) {
  const [page, setPage] = useState(0)
  const [muting, setMuting] = useState<string | null>(null)

  // Self tile first, then remote peers (host already sorted first among peers,
  // but the local participant is always shown as the leading tile here).
  const tiles: Tile[] = [
    { kind: "local", identity: self.identity, name: self.name, image: self.image, isHost },
    ...peers.map((peer) => ({ kind: "remote" as const, peer })),
  ]

  const pageCount = Math.max(1, Math.ceil(tiles.length / TILES_PER_PAGE))
  // Clamp the page if participants leave and shrink the grid.
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])

  const start = page * TILES_PER_PAGE
  const pageTiles = tiles.slice(start, start + TILES_PER_PAGE)

  async function handleMute(identity: string) {
    setMuting(identity)
    try {
      await muteParticipant({ roomName, userId: identity })
    } finally {
      setMuting(null)
    }
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* Tile grid */}
      <div className="min-h-0 flex-1 p-2">
        <div className="grid h-full grid-cols-2 grid-rows-4 gap-2">
          {pageTiles.map((tile) =>
            tile.kind === "local" ? (
              <LocalTile
                key="local"
                name={`${tile.name} (You)`}
                image={tile.image}
                isHost={tile.isHost}
                videoRef={localVideoRef}
                camOn={camOn}
                micOn={micOn}
                ready={localVideoReady}
              />
            ) : (
              <RemoteTile
                key={tile.peer.identity}
                peer={tile.peer}
                registerPeerVideoEl={registerPeerVideoEl}
                canModerate={isHost}
                muting={muting === tile.peer.identity}
                onMute={() => void handleMute(tile.peer.identity)}
                onAskUnmute={() => onAskUnmute(tile.peer.identity)}
              />
            ),
          )}
          {/* Fill empty cells so the 2×4 structure stays stable on sparse pages. */}
          {Array.from({ length: TILES_PER_PAGE - pageTiles.length }).map((_, i) => (
            <div key={`empty-${i}`} className="rounded-2xl border border-white/5 bg-white/[0.02]" />
          ))}
        </div>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-4 pb-1 text-white">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Previous page"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-xs font-medium text-white/70">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page === pageCount - 1}
            aria-label="Next page"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}

      {/* Bottom control dock */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-neutral-900 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <DockButton label={micOn ? "Mute mic" : "Unmute mic"} onClick={onToggleMic} active={!micOn}>
          {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </DockButton>
        <DockButton label={camOn ? "Turn camera off" : "Turn camera on"} onClick={onToggleCam} active={!camOn}>
          {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
        </DockButton>
        <DockButton label="Flip camera" onClick={onFlipCamera}>
          <SwitchCamera className="size-5" />
        </DockButton>
        {isHost && onAddTrack && (
          <DockButton label="Add track" onClick={onAddTrack}>
            <Music className="size-5" />
          </DockButton>
        )}
        <button
          type="button"
          onClick={onLeave}
          aria-label={isHost ? "End meeting" : "Leave meeting"}
          className="flex h-11 items-center gap-2 rounded-full bg-destructive px-5 text-sm font-semibold text-destructive-foreground"
        >
          <PhoneOff className="size-5" />
          {isHost ? "End" : "Leave"}
        </button>
      </div>
    </div>
  )
}

/** The local participant's self-view tile. */
function LocalTile({
  name,
  image,
  isHost,
  videoRef,
  camOn,
  micOn,
  ready,
}: {
  name: string
  image: string | null
  isHost: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  camOn: boolean
  micOn: boolean
  ready: boolean
}) {
  return (
    <TileFrame>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute inset-0 size-full -scale-x-100 object-cover transition-opacity",
          camOn && ready ? "opacity-100" : "opacity-0",
        )}
      />
      {(!camOn || !ready) && <Avatar name={name} image={image} />}
      <TileFooter name={name} isHost={isHost} micMuted={!micOn} />
    </TileFrame>
  )
}

/** A remote participant's tile, with optional host moderation controls. */
function RemoteTile({
  peer,
  registerPeerVideoEl,
  canModerate,
  muting,
  onMute,
  onAskUnmute,
}: {
  peer: RemotePeer
  registerPeerVideoEl: (identity: string, el: HTMLVideoElement | null) => void
  canModerate: boolean
  muting: boolean
  onMute: () => void
  onAskUnmute: () => void
}) {
  return (
    <TileFrame>
      <video
        // Ref callback matches the codebase pattern (see SlotTile): register the
        // element with the hook so LiveKit attaches this peer's video track.
        ref={(el) => registerPeerVideoEl(peer.identity, el)}
        autoPlay
        playsInline
        className={cn("absolute inset-0 size-full object-cover transition-opacity", peer.hasVideo ? "opacity-100" : "opacity-0")}
      />
      {!peer.hasVideo && <Avatar name={peer.name} image={peer.image} />}
      <TileFooter name={peer.name} isHost={peer.isHost} micMuted={peer.micMuted} />

      {/* Host moderation: mute when they're live, or ask them to unmute. */}
      {canModerate && (
        <div className="absolute right-1.5 top-1.5">
          {peer.micMuted ? (
            <button
              type="button"
              onClick={onAskUnmute}
              className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-white backdrop-blur"
            >
              <Volume2 className="size-3.5" /> Ask
            </button>
          ) : (
            <button
              type="button"
              onClick={onMute}
              disabled={muting}
              aria-label={`Mute ${peer.name}`}
              className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur disabled:opacity-50"
            >
              <MicOff className="size-4" />
            </button>
          )}
        </div>
      )}
    </TileFrame>
  )
}

function TileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-neutral-800 ring-1 ring-inset ring-white/10">{children}</div>
  )
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  const initials = name
    .replace(/\(You\)/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image || "/placeholder.svg"} alt={name} className="size-16 rounded-full object-cover" />
      ) : (
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/30 text-lg font-bold text-white">
          {initials || "?"}
        </div>
      )}
    </div>
  )
}

function TileFooter({ name, isHost, micMuted }: { name: string; isHost: boolean; micMuted: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
      {micMuted && <MicOff className="size-3.5 shrink-0 text-destructive" />}
      {isHost && <Crown className="size-3.5 shrink-0 text-primary" />}
      <span className="truncate text-xs font-medium text-white">{name}</span>
    </div>
  )
}

function DockButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-full text-white transition-colors",
        active ? "bg-destructive text-destructive-foreground" : "bg-white/10 hover:bg-white/20",
      )}
    >
      {children}
    </button>
  )
}
