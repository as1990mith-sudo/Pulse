"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Mic,
  MicOff,
  MoreVertical,
  Music,
  PhoneOff,
  Pin,
  PinOff,
  Star,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react"
import type { RemotePeer } from "@/lib/use-live-video"
import type { CurrentUser } from "@/lib/session"
import {
  muteParticipant,
  setGridCohost,
  requestGridPin,
  respondGridPin,
  endBroadcast,
} from "@/app/actions/live"
import { LiveChat } from "@/components/live-chat"
import { cn } from "@/lib/utils"

// Pages 2+ show a 2-column × 3-row grid (the 4th row's space is the static
// chatroom). Page 1 is a single large spotlight tile.
const GRID_COLS = 2
const GRID_ROWS = 3
const TILES_PER_GRID_PAGE = GRID_COLS * GRID_ROWS // 6

/** One participant in the meeting, unified for local + remote rendering. */
type Tile =
  | { kind: "local"; identity: string; name: string; image: string | null }
  | { kind: "remote"; identity: string; peer: RemotePeer }

/**
 * Google Meet / Zoom-style meeting grid for a "Grid" video live.
 *
 * - Page 1 spotlights the pinned participant (the host by default) as one large
 *   tile above a **static** chatroom.
 * - Pages 2+ are 2×3 grids of everyone else above that same fixed chatroom.
 *   Only the tiles above the chat paginate horizontally; the chat never moves.
 * - The host can promote a co-host (full host parity) and request to pin any
 *   participant; the pinned person accepts before taking the spotlight.
 *
 * Co-host/pin state is polled by the parent (getCallState) and passed down here
 * so late joiners and everyone else stay in sync.
 */
export function MeetingGrid({
  roomName,
  self,
  peers,
  currentUser,
  hostId,
  gridCohostId,
  gridPinnedId,
  gridPinRequest,
  onRefreshState,
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
  chatBgUrl = null,
  chatBgEffect = "none",
}: {
  roomName: string
  self: { identity: string; name: string; image: string | null }
  peers: RemotePeer[]
  currentUser: CurrentUser | null
  hostId: string | null
  gridCohostId: string | null
  gridPinnedId: string | null
  gridPinRequest: { userId: string; userName: string } | null
  onRefreshState: () => void
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
  chatBgUrl?: string | null
  chatBgEffect?: "none" | "blur" | "dim"
}) {
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  // Who am I? The host and the grid co-host are "controllers" with full powers.
  const amHost = self.identity === hostId
  const amCohost = !!gridCohostId && self.identity === gridCohostId && !amHost
  const isController = amHost || amCohost

  // Unified tile list: local self first, then remote peers.
  const tiles: Tile[] = [
    { kind: "local", identity: self.identity, name: self.name, image: self.image },
    ...peers.map((peer) => ({ kind: "remote" as const, identity: peer.identity, peer })),
  ]

  // The spotlight is the pinned participant, defaulting to the host. Fall back
  // to the host (then anyone) if the pinned person has left.
  const pinnedId = gridPinnedId ?? hostId
  const spotlight =
    tiles.find((t) => t.identity === pinnedId) ??
    tiles.find((t) => t.identity === hostId) ??
    tiles[0]

  // Everyone else fills the grid pages. The co-host leads page 2.
  const rest = tiles
    .filter((t) => t.identity !== spotlight?.identity)
    .sort((a, b) => (a.identity === gridCohostId ? -1 : b.identity === gridCohostId ? 1 : 0))

  const gridPageCount = Math.ceil(rest.length / TILES_PER_GRID_PAGE)
  // Page 0 is the spotlight; pages 1..gridPageCount are the grids.
  const pageCount = 1 + gridPageCount

  // Clamp the page if participants leave and pages shrink.
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])

  // Close any open tile menu when navigating.
  useEffect(() => {
    setMenuFor(null)
  }, [page])

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
      setMenuFor(null)
      onRefreshState()
    }
  }

  // ── Swipe to change pages (only the tiles above the chat move) ──────────
  const touchX = useRef<number | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0]?.clientX ?? null
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 50) return
    if (dx < 0) setPage((p) => Math.min(pageCount - 1, p + 1))
    else setPage((p) => Math.max(0, p - 1))
  }

  // A per-tile controller menu (mute / pin / co-host), rendered for controllers.
  function tileMenu(tile: Tile, peer: RemotePeer | null) {
    if (!isController || tile.identity === self.identity) return null
    const isPinned = (gridPinnedId ?? hostId) === tile.identity
    const isThisCohost = gridCohostId === tile.identity
    const open = menuFor === tile.identity
    return (
      <div className="absolute right-1.5 top-1.5 z-20">
        <button
          type="button"
          onClick={() => setMenuFor(open ? null : tile.identity)}
          aria-label="Participant options"
          className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
        >
          <MoreVertical className="size-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-8 w-44 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 text-sm text-white shadow-2xl backdrop-blur-xl">
            <MenuItem
              onClick={() =>
                run(`pin-${tile.identity}`, () =>
                  isPinned
                    ? requestGridPin({ roomName, userId: hostId ?? "", userName: "Host" })
                    : requestGridPin({ roomName, userId: tile.identity, userName: tileName(tile, peer) }),
                )
              }
            >
              {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {isPinned ? "Unpin spotlight" : "Request spotlight"}
            </MenuItem>
            {amHost && (
              <MenuItem
                onClick={() =>
                  run(`cohost-${tile.identity}`, () =>
                    setGridCohost({ roomName, userId: isThisCohost ? "" : tile.identity }),
                  )
                }
              >
                <Star className={cn("size-4", isThisCohost && "fill-primary text-primary")} />
                {isThisCohost ? "Remove co-host" : "Make co-host"}
              </MenuItem>
            )}
            {peer &&
              (peer.micMuted ? (
                <MenuItem onClick={() => (onAskUnmute(tile.identity), setMenuFor(null))}>
                  <Volume2 className="size-4" /> Ask to unmute
                </MenuItem>
              ) : (
                <MenuItem
                  disabled={busy === `mute-${tile.identity}`}
                  onClick={() => run(`mute-${tile.identity}`, () => muteParticipant({ roomName, userId: tile.identity }))}
                >
                  <MicOff className="size-4" /> Mute
                </MenuItem>
              ))}
          </div>
        )}
      </div>
    )
  }

  // Render one tile at either spotlight (big) or grid size.
  function renderTile(tile: Tile, opts: { big?: boolean } = {}) {
    const peer = tile.kind === "remote" ? tile.peer : null
    const isCohostTile = gridCohostId === tile.identity
    const isHostTile = hostId === tile.identity
    const displayName =
      tile.identity === self.identity ? `${tileName(tile, peer)} (You)` : tileName(tile, peer)
    return (
      <div key={tile.identity} className={cn("flex min-h-0 flex-col", opts.big ? "h-full" : "min-h-0")}>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-neutral-800">
          {tile.kind === "local" ? (
            <>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "absolute inset-0 size-full -scale-x-100 object-cover transition-opacity",
                  camOn && localVideoReady ? "opacity-100" : "opacity-0",
                )}
              />
              {(!camOn || !localVideoReady) && <Avatar name={tile.name} image={tile.image} big={opts.big} />}
            </>
          ) : (
            <>
              <video
                ref={(el) => registerPeerVideoEl(tile.identity, el)}
                autoPlay
                playsInline
                className={cn(
                  "absolute inset-0 size-full object-cover transition-opacity",
                  peer!.hasVideo ? "opacity-100" : "opacity-0",
                )}
              />
              {!peer!.hasVideo && <Avatar name={peer!.name} image={peer!.image} big={opts.big} />}
            </>
          )}

          {/* Role + mic badges, top-left. */}
          <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1">
            {isHostTile && <Badge tone="host" icon={<Crown className="size-3" />} label="Host" />}
            {isCohostTile && <Badge tone="cohost" icon={<Star className="size-3" />} label="Co-host" />}
          </div>

          {tileMenu(tile, peer)}
        </div>
        <ParticipantName
          name={displayName}
          isHost={isHostTile}
          isCohost={isCohostTile}
          muted={peer ? peer.micMuted : !micOn}
        />
      </div>
    )
  }

  const gridStart = (page - 1) * TILES_PER_GRID_PAGE
  const gridTiles = page >= 1 ? rest.slice(gridStart, gridStart + TILES_PER_GRID_PAGE) : []

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* ── Tiles region (3 rows worth) — this is what paginates ─────────── */}
      <div
        className="relative min-h-0 flex-[3]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {page === 0 ? (
          <div className="h-full p-2">{spotlight && renderTile(spotlight, { big: true })}</div>
        ) : (
          <div className="grid h-full grid-cols-2 grid-rows-3 gap-1.5 p-2">
            {gridTiles.map((tile) => renderTile(tile))}
            {Array.from({ length: TILES_PER_GRID_PAGE - gridTiles.length }).map((_, i) => (
              <div key={`empty-${i}`} className="border border-white/5 bg-white/[0.02]" />
            ))}
          </div>
        )}

        {/* Page arrows — overlaid on the tiles region only, so the chat stays put. */}
        {pageCount > 1 && (
          <>
            {page > 0 && (
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous page"
                className="absolute left-1 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            {page < pageCount - 1 && (
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                aria-label="Next page"
                className="absolute right-1 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
            {/* Page dots */}
            <div className="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex items-center justify-center gap-1.5">
              {Array.from({ length: pageCount }).map((_, i) => (
                <span
                  key={i}
                  className={cn("size-1.5 rounded-full transition-colors", i === page ? "bg-white" : "bg-white/30")}
                />
              ))}
            </div>
          </>
        )}

        {/* Spotlight pin request: the targeted participant accepts / declines. */}
        {gridPinRequest?.userId === self.identity && (
          <div className="absolute inset-x-3 top-3 z-30 flex flex-col gap-2 rounded-2xl border border-white/10 bg-neutral-900/95 p-3 text-white shadow-2xl backdrop-blur-xl">
            <p className="text-sm font-medium text-pretty">The host wants to spotlight you on the main screen.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => run("pin-accept", () => respondGridPin({ roomName, accept: true }))}
                className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => run("pin-decline", () => respondGridPin({ roomName, accept: false }))}
                className="flex-1 rounded-full bg-white/10 py-2 text-sm font-semibold"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Controller-side hint while a pin request is awaiting acceptance. */}
        {isController && gridPinRequest && gridPinRequest.userId !== self.identity && (
          <div className="absolute inset-x-3 top-3 z-30 rounded-full bg-black/70 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur">
            Waiting for {gridPinRequest.userName} to accept the spotlight…
          </div>
        )}
      </div>

      {/* ── Static chatroom (occupies the old 4th row; never paginates) ──── */}
      <div className="min-h-0 flex-[1] border-t border-white/10">
        <LiveChat
          asHost={isController}
          currentUser={currentUser}
          roomName={roomName}
          bgUrl={chatBgUrl}
          bgEffect={chatBgEffect}
          immersive
        />
      </div>

      {/* ── Bottom control dock ──────────────────────────────────────────── */}
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
        {isController && onAddTrack && (
          <DockButton label="Add track" onClick={onAddTrack}>
            <Music className="size-5" />
          </DockButton>
        )}
        <button
          type="button"
          onClick={() => {
            // A co-host with full parity ends the live for everyone; the host
            // defers to its own end-confirm (onLeave); others just leave.
            if (amCohost) void run("end", async () => {
              await endBroadcast({ roomName })
              onLeave()
            })
            else onLeave()
          }}
          aria-label={isController ? "End meeting" : "Leave meeting"}
          className="flex h-11 items-center gap-2 rounded-full bg-destructive px-5 text-sm font-semibold text-destructive-foreground"
        >
          <PhoneOff className="size-5" />
          {isController ? "End" : "Leave"}
        </button>
      </div>
    </div>
  )
}

function tileName(tile: Tile, peer: RemotePeer | null): string {
  return tile.kind === "local" ? tile.name : peer!.name
}

/**
 * Participant name shown *under* each tile. When the name is too long to fit on
 * one line it scrolls right-to-left (marquee); otherwise it's a static, centered
 * label. Uses the shared `.marquee` styles from globals.css.
 */
function ParticipantName({
  name,
  isHost,
  isCohost,
  muted,
}: {
  name: string
  isHost: boolean
  isCohost: boolean
  muted: boolean
}) {
  const measureRef = useRef<HTMLSpanElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)

  useLayoutEffect(() => {
    const measure = measureRef.current
    const wrap = wrapRef.current
    if (!measure || !wrap) return
    const check = () => setOverflow(measure.scrollWidth > wrap.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [name])

  return (
    <div className="mt-1 flex shrink-0 items-center justify-center gap-1 px-1.5">
      {muted && <MicOff className="size-3 shrink-0 text-destructive" />}
      {isHost && <Crown className="size-3 shrink-0 text-primary" />}
      {isCohost && !isHost && <Star className="size-3 shrink-0 text-primary" />}
      <div ref={wrapRef} className="relative min-w-0 flex-1 overflow-hidden">
        {/* Hidden measuring copy — always present so we can re-check on resize. */}
        <span ref={measureRef} className="invisible absolute whitespace-nowrap text-xs" aria-hidden="true">
          {name}
        </span>
        {overflow ? (
          <div className="marquee w-full">
            <div className="marquee__track">
              <span className="text-xs font-medium text-white">{name}</span>
              <span className="text-xs font-medium text-white">{name}</span>
            </div>
          </div>
        ) : (
          <span className="block truncate text-center text-xs font-medium text-white">{name}</span>
        )}
      </div>
    </div>
  )
}

function Avatar({ name, image, big }: { name: string; image: string | null; big?: boolean }) {
  const initials = name
    .replace(/\(You\)/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
  const size = big ? "size-24" : "size-16"
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image || "/placeholder.svg"} alt={name} className={cn("rounded-full object-cover", size)} />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-primary/30 font-bold text-white",
            size,
            big ? "text-3xl" : "text-lg",
          )}
        >
          {initials || "?"}
        </div>
      )}
    </div>
  )
}

function Badge({ tone, icon, label }: { tone: "host" | "cohost"; icon: React.ReactNode; label: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur",
        tone === "host" ? "bg-primary/80" : "bg-black/60",
      )}
    >
      {icon}
      {label}
    </span>
  )
}

function MenuItem({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/10 disabled:opacity-50"
    >
      {children}
    </button>
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
