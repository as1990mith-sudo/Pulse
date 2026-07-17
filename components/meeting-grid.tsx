"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
  MoreVertical,
  Music,
  Pin,
  PinOff,
  Settings2,
  Star,
  SwitchCamera,
  UserX,
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react"
import type { RemotePeer } from "@/lib/use-live-video"
import type { CurrentUser } from "@/lib/session"
import {
  blockParticipant,
  muteParticipant,
  setGridCohost,
  requestGridPin,
  respondGridPin,
} from "@/app/actions/live"
import { LiveChat } from "@/components/live-chat"
import { cn } from "@/lib/utils"

// The grid is a 3-column × 3-row page (the old 4th row is now the static chat).
const GRID_COLS = 3
const GRID_ROWS = 3
const TILES_PER_PAGE = GRID_COLS * GRID_ROWS // 9

/** One participant in the meeting, unified for local + remote rendering. */
type Tile =
  | { kind: "local"; identity: string; name: string; image: string | null }
  | { kind: "remote"; identity: string; peer: RemotePeer }

/**
 * Google Meet / Zoom-style meeting grid for a "Grid" video live.
 *
 * - Pages start at the grid (2×3) above a **static** chatroom that never moves.
 * - There is no dedicated spotlight page. When a participant is pinned, on page
 *   1 they get a full-width spotlight sized to their camera: a landscape feed
 *   takes the first row, a portrait feed takes the first two rows, and the
 *   remaining row(s) stay a grid. Orientation is auto-detected from the video.
 * - With nobody pinned, order is host, then co-host, then join order.
 * - Controllers (host + co-host) can pin, promote a co-host, mute, and remove.
 *
 * Co-host/pin state is polled by the parent (getCallState) and passed down so
 * late joiners and everyone else stay in sync.
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
  localSpeaking = false,
  facingMode = "user",
  onToggleMic,
  onToggleCam,
  onFlipCamera,
  onAskUnmute,
  onAddTrack,
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
  // Whether the local participant is currently an active speaker (tile glow).
  localSpeaking?: boolean
  // Front ("user") vs back ("environment") camera — the self-view only mirrors
  // for the front camera.
  facingMode?: "user" | "environment"
  onToggleMic: () => void
  onToggleCam: () => void
  onFlipCamera: () => void
  onAskUnmute: (identity: string) => void
  onAddTrack?: () => void
  // Participants leave via the header back button, so there is no in-grid leave
  // handler; this stays optional for backwards compatibility with callers.
  onLeave?: () => void
  chatBgUrl?: string | null
  chatBgEffect?: "none" | "blur" | "dim"
}) {
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  // Auto-detected orientation of the pinned participant's video feed. "portrait"
  // gives the spotlight two rows; "landscape" gives it one.
  const [spotlightShape, setSpotlightShape] = useState<"landscape" | "portrait">("landscape")

  // Who am I? The host and the grid co-host are "controllers" with full powers.
  const amHost = self.identity === hostId
  const amCohost = !!gridCohostId && self.identity === gridCohostId && !amHost
  const isController = amHost || amCohost

  // Unified tile list: local self first, then remote peers.
  const tiles: Tile[] = [
    { kind: "local", identity: self.identity, name: self.name, image: self.image },
    ...peers.map((peer) => ({ kind: "remote" as const, identity: peer.identity, peer })),
  ]

  // Ordering with nobody pinned: host first, then co-host, then join order.
  const orderRank = (id: string) => (id === hostId ? 0 : id === gridCohostId ? 1 : 2)
  const ordered = [...tiles].sort((a, b) => orderRank(a.identity) - orderRank(b.identity))

  // The spotlight is the explicitly pinned participant (if still present). Unlike
  // before, the host is NOT pinned by default — no pin means a pure grid.
  const spotlight = gridPinnedId ? ordered.find((t) => t.identity === gridPinnedId) ?? null : null
  const hasSpotlight = !!spotlight

  // Everyone who isn't the spotlight fills the grid, in the same order.
  const rest = ordered.filter((t) => t.identity !== spotlight?.identity)

  // Page 1 (index 0) reserves rows for the spotlight when one exists, leaving
  // fewer grid slots on that page. Later pages are full 6-slot grids.
  const spotlightRows = hasSpotlight ? (spotlightShape === "portrait" ? 2 : 1) : 0
  const firstPageGridRows = GRID_ROWS - spotlightRows
  const firstPageSlots = hasSpotlight ? firstPageGridRows * GRID_COLS : TILES_PER_PAGE

  const overflow = Math.max(0, rest.length - firstPageSlots)
  const extraPages = Math.ceil(overflow / TILES_PER_PAGE)
  const pageCount = Math.max(1, 1 + extraPages)

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

  // A per-tile controller menu (pin / co-host / mute / remove).
  function tileMenu(tile: Tile, peer: RemotePeer | null) {
    if (!isController || tile.identity === self.identity) return null
    const isPinned = gridPinnedId === tile.identity
    const isThisCohost = gridCohostId === tile.identity
    const isThisHost = hostId === tile.identity
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
                    ? respondGridPin({ roomName, accept: false })
                    : requestGridPin({ roomName, userId: tile.identity, userName: tileName(tile, peer) }),
                )
              }
            >
              {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {isPinned ? "Remove spotlight" : "Request spotlight"}
            </MenuItem>
            {amHost && !isThisHost && (
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
            {!isThisHost && (
              <MenuItem
                disabled={busy === `remove-${tile.identity}`}
                onClick={() =>
                  run(`remove-${tile.identity}`, () =>
                    blockParticipant({ roomName, userId: tile.identity, userName: tileName(tile, peer) }),
                  )
                }
              >
                <UserX className="size-4 text-destructive" />
                <span className="text-destructive">Remove from meeting</span>
              </MenuItem>
            )}
          </div>
        )}
      </div>
    )
  }

  // Render one tile. `spotlightTile` sizing is handled by the parent grid cell.
  function renderTile(tile: Tile, opts: { big?: boolean } = {}) {
    const peer = tile.kind === "remote" ? tile.peer : null
    const isCohostTile = gridCohostId === tile.identity
    const isHostTile = hostId === tile.identity
    const displayName = tile.identity === self.identity ? `${tileName(tile, peer)} (You)` : tileName(tile, peer)
    // Glow the tile while this participant is an active speaker.
    const speaking = tile.kind === "local" ? localSpeaking : !!peer?.isSpeaking
    return (
      <div
        className={cn(
          "relative size-full overflow-hidden rounded-xl bg-neutral-800 transition-shadow duration-150",
          speaking && "ring-2 ring-primary shadow-[0_0_0_3px_rgba(0,0,0,0.4),0_0_18px_2px_var(--color-primary)]",
        )}
      >
        {tile.kind === "local" ? (
          <>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "absolute inset-0 size-full object-cover transition-opacity",
                // Mirror only the front camera; the back camera shows the world
                // as-is, so mirroring it would look wrong.
                facingMode === "user" && "-scale-x-100",
                camOn && localVideoReady ? "opacity-100" : "opacity-0",
              )}
            />
            {(!camOn || !localVideoReady) && <Avatar name={tile.name} image={tile.image} big={opts.big} />}
          </>
        ) : (
          <>
            <video
              ref={(el) => {
                registerPeerVideoEl(tile.identity, el)
                // Auto-detect the spotlighted person's orientation from the feed.
                if (opts.big && el) attachShapeWatcher(el, setSpotlightShape)
              }}
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

        {/* Role badges, top-left. The host is just a plain "Host" pill (no crown). */}
        <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1">
          {isHostTile && <Badge tone="host" label="Host" />}
          {isCohostTile && <Badge tone="cohost" icon={<Star className="size-3" />} label="Co-host" />}
        </div>

        {tileMenu(tile, peer)}

        {/* Name overlaid on the video with only a very faint shadow so it never
            hides the picture. */}
        <NameOverlay name={displayName} isCohost={isCohostTile} muted={peer ? peer.micMuted : !micOn} />
      </div>
    )
  }

  // Compute which tiles show on the current page's grid area.
  let gridTiles: Tile[]
  if (page === 0) {
    gridTiles = rest.slice(0, firstPageSlots)
  } else {
    const start = firstPageSlots + (page - 1) * TILES_PER_PAGE
    gridTiles = rest.slice(start, start + TILES_PER_PAGE)
  }
  // How many grid rows this page may use (page 1 shrinks when a spotlight is shown).
  const gridRowsThisPage = page === 0 && hasSpotlight ? firstPageGridRows : GRID_ROWS
  // Only render as many rows as there are tiles, so a near-empty room doesn't
  // leave a wall of blank boxes — the present tiles fill the available height.
  const rowsUsed = Math.max(1, Math.min(gridRowsThisPage, Math.ceil(gridTiles.length / GRID_COLS)))

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* ── Tiles region (3 rows worth) — this is what paginates ─────────── */}
      <div className="relative min-h-0 flex-[3]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="flex h-full flex-col gap-1.5 p-2">
          {/* Spotlight band (page 1 only, when someone is pinned). */}
          {page === 0 && hasSpotlight && spotlight && (
            <div className="min-h-0" style={{ flex: spotlightRows }}>
              {renderTile(spotlight, { big: true })}
            </div>
          )}
          {/* Grid band — 3 tiles per row, each filling its cell. Only real
              participants are rendered (no empty placeholder boxes). */}
          {gridRowsThisPage > 0 && gridTiles.length > 0 && (
            <div
              className="grid min-h-0 flex-1 gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rowsUsed}, minmax(0, 1fr))`,
              }}
            >
              {gridTiles.map((tile) => (
                <div key={tile.identity} className="min-h-0">
                  {renderTile(tile)}
                </div>
              ))}
            </div>
          )}
        </div>

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
            <p className="text-pretty text-sm font-medium">You&apos;ve been asked to be spotlighted on the main screen.</p>
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

      {/* ── Static chatroom (occupies the old 4th row; never paginates). The
          meeting controls now live inline at the LEFT of the composer (where the
          emoji used to be); the emoji moves to the RIGHT next to Send. There is
          no End/Leave button — everyone leaves via the header back button. ──── */}
      <div className="min-h-0 flex-[1] border-t border-white/10">
        <LiveChat
          asHost={isController}
          currentUser={currentUser}
          roomName={roomName}
          bgUrl={chatBgUrl}
          bgEffect={chatBgEffect}
          immersive
          emojiSide="right"
          leadingSlot={
            <div className="relative shrink-0">
              {/* Collapsible controls popover so mic/cam/flip/music don't eat
                  space; opens upward from the composer. */}
              {controlsOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setControlsOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute bottom-full left-0 z-20 mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
                    <DockButton label={micOn ? "Mute mic" : "Unmute mic"} onClick={onToggleMic} active={!micOn}>
                      {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                    </DockButton>
                    <DockButton
                      label={camOn ? "Turn camera off" : "Turn camera on"}
                      onClick={onToggleCam}
                      active={!camOn}
                    >
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
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => setControlsOpen((o) => !o)}
                aria-label={controlsOpen ? "Hide controls" : "Show controls"}
                aria-expanded={controlsOpen}
                className={cn(
                  "relative z-20 flex size-10 items-center justify-center rounded-full text-white transition-colors",
                  controlsOpen ? "bg-white/20" : "bg-white/10 hover:bg-white/20",
                )}
              >
                {controlsOpen ? <X className="size-5" /> : <Settings2 className="size-5" />}
              </button>
            </div>
          }
        />
      </div>
    </div>
  )
}

/**
 * Watch a spotlight <video> element and report whether its feed is landscape or
 * portrait, so the parent can size the spotlight band (1 row vs 2 rows). Cheap:
 * one listener on `resize`, deduped per element.
 */
function attachShapeWatcher(
  el: HTMLVideoElement & { __shapeWatched?: boolean },
  setShape: (s: "landscape" | "portrait") => void,
) {
  if (el.__shapeWatched) return
  el.__shapeWatched = true
  const report = () => {
    if (!el.videoWidth || !el.videoHeight) return
    setShape(el.videoWidth >= el.videoHeight ? "landscape" : "portrait")
  }
  el.addEventListener("loadedmetadata", report)
  el.addEventListener("resize", report)
  report()
}

function tileName(tile: Tile, peer: RemotePeer | null): string {
  return tile.kind === "local" ? tile.name : peer!.name
}

/**
 * Participant name shown *over* the bottom of each tile with only a faint
 * shadow (no dark bar) so the video stays visible. When the name is too long to
 * fit on one line it scrolls right-to-left (marquee) using the shared
 * `.marquee` styles from globals.css.
 */
function NameOverlay({
  name,
  isCohost,
  muted,
}: {
  name: string
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
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 px-2 pb-1.5 pt-4"
      style={{
        // ~10% black — a very faint gradient shadow, not an opaque bar.
        background: "linear-gradient(to top, rgba(0,0,0,0.10), rgba(0,0,0,0))",
      }}
    >
      {muted && <MicOff className="size-3 shrink-0 text-destructive drop-shadow" />}
      {isCohost && <Star className="size-3 shrink-0 text-primary drop-shadow" />}
      <div ref={wrapRef} className="relative min-w-0 flex-1 overflow-hidden">
        {/* Hidden measuring copy — always present so we can re-check on resize. */}
        <span ref={measureRef} className="invisible absolute whitespace-nowrap text-xs" aria-hidden="true">
          {name}
        </span>
        {overflow ? (
          <div className="marquee w-full">
            <div className="marquee__track">
              <span className="text-xs font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">{name}</span>
              <span className="text-xs font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">{name}</span>
            </div>
          </div>
        ) : (
          <span className="block truncate text-xs font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
            {name}
          </span>
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

function Badge({ tone, icon, label }: { tone: "host" | "cohost"; icon?: React.ReactNode; label: string }) {
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
