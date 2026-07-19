"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AnimatePresence, motion, type Variants } from "motion/react"
import {
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  Lock,
  LockOpen,
  MessageSquare,
  Mic,
  MicOff,
  MoreVertical,
  Music,
  Pin,
  PinOff,
  Radio,
  Settings2,
  SwitchCamera,
  UserPlus,
  UserX,
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ImageLightbox } from "@/components/image-lightbox"
import { LiveChat } from "@/components/live-chat"
import { FloatingMessages } from "@/components/conversation/floating-messages"
import { PrayerOverlay, PrayerEndedToast } from "@/components/conversation/prayer-overlay"
import {
  blockParticipant,
  getLiveChat,
  muteParticipant,
  requestGridPin,
  respondGridPin,
  setGridCohost,
  setGridLayout,
  setPrayerMode,
  setRoomLock,
  type GridLayout,
  type LiveChatMessageView,
} from "@/app/actions/live"
import type { RemotePeer } from "@/lib/use-live-video"
import type { CurrentUser } from "@/lib/session"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

/** One participant, unified for local + remote rendering. */
type Tile =
  | { kind: "local"; identity: string; name: string; image: string | null }
  | { kind: "remote"; identity: string; peer: RemotePeer }

/** Per-layout geometry. Every participant shares the host-selected layout. */
const LAYOUTS: Record<GridLayout, { cols: number; perPage: number; label: string; icon: typeof Grid2x2 }> = {
  compact: { cols: 3, perPage: 9, label: "Compact", icon: Grid3x3 },
  balanced: { cols: 2, perPage: 6, label: "Balanced", icon: LayoutGrid },
  focus: { cols: 2, perPage: 4, label: "Focus", icon: Grid2x2 },
}

// Horizontal page transition (custom = swipe direction).
const pageVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80 }),
}

export type ConversationVideoProps = {
  roomName: string
  self: { identity: string; name: string; image: string | null }
  peers: RemotePeer[]
  currentUser: CurrentUser | null
  hostId: string | null
  gridCohostId: string | null
  gridPinnedIds: string[]
  gridPinRequest: { userId: string; userName: string } | null
  gridLayout: GridLayout
  prayerActive: boolean
  locked: boolean
  onRefreshState: () => void
  // Live media plumbing (owned by the parent hook).
  localVideoRef: React.RefObject<HTMLVideoElement | null>
  registerPeerVideoEl: (identity: string, el: HTMLVideoElement | null) => void
  micOn: boolean
  camOn: boolean
  localVideoReady: boolean
  localSpeaking?: boolean
  facingMode?: "user" | "environment"
  onToggleMic: () => void
  onToggleCam: () => void
  onFlipCamera: () => void
  onAskUnmute: (identity: string) => void
  onAddTrack?: () => void
  chatBgUrl?: string | null
  chatBgEffect?: "none" | "blur" | "dim"
  // Room identity for the exclusive Conversation header.
  title: string
  cover: string | null
  hostName: string
  category?: string | null
  topic?: string | null
  // Consumer-owned slots so host/viewer keep their own back + options logic.
  backSlot?: React.ReactNode
  moreSlot?: React.ReactNode
  // Optional host actions delegated to the parent (music panel owns the hook).
  onOpenMusic?: () => void
  onInvite?: () => void
  // Small pinned-resource indicator in the header.
  pinnedCount?: number
  connected?: boolean
}

export function ConversationVideo(props: ConversationVideoProps) {
  const {
    roomName,
    self,
    peers,
    currentUser,
    hostId,
    gridCohostId,
    gridPinnedIds,
    gridPinRequest,
    gridLayout,
    prayerActive,
    locked,
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
    title,
    cover,
    hostName,
    category,
    topic,
    backSlot,
    moreSlot,
    onOpenMusic,
    onInvite,
    pinnedCount = 0,
    connected = true,
  } = props

  const amHost = self.identity === hostId
  const amCohost = !!gridCohostId && self.identity === gridCohostId && !amHost
  const isController = amHost || amCohost

  const layout = LAYOUTS[gridLayout] ?? LAYOUTS.balanced

  // ── Arrival experience — a one-second branded transition into the room ────
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setArrived(true), 1200)
    return () => clearTimeout(t)
  }, [])

  // ── Collapsing header. Expanded on arrival, collapses after a short dwell to
  //    maximise the gathering; tapping the compact bar re-expands briefly. ────
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (!arrived) return
    const t = setTimeout(() => setCollapsed(true), 5200)
    return () => clearTimeout(t)
  }, [arrived])

  const [lightbox, setLightbox] = useState(false)
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState(0)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // ── Chat polling for floating messages (when the panel is closed) ─────────
  const { data: chatMessages = [] } = useSWR<LiveChatMessageView[]>(
    roomName && connected ? ["conv-video-chat", roomName] : null,
    () => getLiveChat({ roomName }),
    { refreshInterval: 2500, revalidateOnFocus: false },
  )

  // ── Speaker-position memory: assign each identity a stable rank the first
  //    time we see it, so a brief disconnect restores the same slot instead of
  //    dropping the person to the end of the list. ──────────────────────────
  const rankRef = useRef<Map<string, number>>(new Map())
  const seqRef = useRef(0)
  const tiles: Tile[] = useMemo(() => {
    const list: Tile[] = [
      { kind: "local", identity: self.identity, name: self.name, image: self.image },
      ...peers.map((peer) => ({ kind: "remote" as const, identity: peer.identity, peer })),
    ]
    for (const t of list) {
      if (!rankRef.current.has(t.identity)) rankRef.current.set(t.identity, seqRef.current++)
    }
    // Host first, then co-host, then stable first-seen order (position memory).
    const roleRank = (id: string) => (id === hostId ? -2 : id === gridCohostId ? -1 : 0)
    return [...list].sort((a, b) => {
      const r = roleRank(a.identity) - roleRank(b.identity)
      if (r !== 0) return r
      return (rankRef.current.get(a.identity) ?? 0) - (rankRef.current.get(b.identity) ?? 0)
    })
  }, [self.identity, self.name, self.image, peers, hostId, gridCohostId])

  // Spotlight: up to two pinned participants floated out of the grid flow.
  const pinnedSet = new Set(gridPinnedIds)
  const spotlight = gridPinnedIds
    .map((id) => tiles.find((t) => t.identity === id))
    .filter((t): t is Tile => !!t)
    .slice(0, 2)
  const rest = tiles.filter((t) => !pinnedSet.has(t.identity))
  const hasSpotlight = spotlight.length > 0

  // Pagination over the non-spotlight tiles.
  const perPage = layout.perPage
  const pageCount = Math.max(1, Math.ceil(rest.length / perPage))
  const clampedPage = Math.min(page, pageCount - 1)
  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1))
  }, [page, pageCount])
  useEffect(() => setMenuFor(null), [clampedPage])

  const pageTiles = rest.slice(clampedPage * perPage, clampedPage * perPage + perPage)

  const goto = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(next, pageCount - 1))
      if (target === clampedPage) return
      setDir(target > clampedPage ? 1 : -1)
      setPage(target)
    },
    [pageCount, clampedPage],
  )

  const participantCount = tiles.length
  const speakingCount = (localSpeaking ? 1 : 0) + peers.filter((p) => p.isSpeaking).length

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

  // ── Per-tile controller menu (spotlight / co-host / mute / remove) ────────
  function TileMenu({ tile }: { tile: Tile }) {
    if (!isController) return null
    const peer = tile.kind === "remote" ? tile.peer : null
    const isSelf = tile.identity === self.identity
    const isPinned = gridPinnedIds.includes(tile.identity)
    const isThisCohost = gridCohostId === tile.identity
    const isThisHost = hostId === tile.identity
    const name = tile.kind === "remote" ? tile.peer.name : tile.name
    const open = menuFor === tile.identity
    return (
      <div className="absolute right-1.5 top-1.5 z-20">
        <button
          type="button"
          onClick={() => setMenuFor(open ? null : tile.identity)}
          aria-label="Participant options"
          className="flex size-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
        >
          <MoreVertical className="size-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-8 w-44 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/95 text-sm text-white shadow-2xl backdrop-blur-xl">
            <MenuItem
              onClick={() =>
                run(`pin-${tile.identity}`, () =>
                  requestGridPin({ roomName, userId: tile.identity, userName: name }),
                )
              }
            >
              {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {isPinned ? "Remove spotlight" : "Spotlight"}
            </MenuItem>
            {amHost && !isThisHost && !isSelf && (
              <MenuItem
                onClick={() =>
                  run(`cohost-${tile.identity}`, () =>
                    setGridCohost({ roomName, userId: isThisCohost ? "" : tile.identity }),
                  )
                }
              >
                <Pin className="size-4" />
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
            {!isThisHost && !isSelf && (
              <MenuItem
                disabled={busy === `remove-${tile.identity}`}
                onClick={() => run(`remove-${tile.identity}`, () => blockParticipant({ roomName, userId: tile.identity, userName: name }))}
              >
                <UserX className="size-4 text-destructive" />
                <span className="text-destructive">Remove</span>
              </MenuItem>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── One participant tile (video or camera-off avatar card) ────────────────
  function VideoTile({ tile, big = false }: { tile: Tile; big?: boolean }) {
    const peer = tile.kind === "remote" ? tile.peer : null
    const speaking = tile.kind === "local" ? localSpeaking : !!peer?.isSpeaking
    const camActive = tile.kind === "local" ? camOn && localVideoReady : !!peer?.hasVideo
    const micActive = tile.kind === "local" ? micOn : !peer?.micMuted
    const name = tile.kind === "local" ? `${tile.name} (You)` : peer!.name
    const image = tile.kind === "local" ? tile.image : peer!.image
    const isHostTile = hostId === tile.identity
    const isCohostTile = gridCohostId === tile.identity
    return (
      <motion.div
        layout
        layoutId={tile.identity}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: speaking ? 1.03 : 1 }}
        exit={{ opacity: 0, scale: 0.7 }}
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
        className={cn(
          "relative size-full overflow-hidden rounded-3xl bg-neutral-800/80 shadow-lg ring-1 ring-white/5",
          speaking && "ring-2 ring-primary shadow-[0_0_22px_2px_color-mix(in_oklch,var(--primary)_45%,transparent)]",
        )}
      >
        {camActive ? (
          tile.kind === "local" ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn("absolute inset-0 size-full object-cover", facingMode === "user" && "-scale-x-100")}
            />
          ) : (
            <video
              ref={(el) => registerPeerVideoEl(tile.identity, el)}
              autoPlay
              playsInline
              className="absolute inset-0 size-full object-cover"
            />
          )
        ) : (
          <>
            {/* Keep the remote <video> mounted (hidden) so it attaches when cam returns. */}
            {tile.kind === "remote" && (
              <video
                ref={(el) => registerPeerVideoEl(tile.identity, el)}
                autoPlay
                playsInline
                className="absolute inset-0 size-full object-cover opacity-0"
              />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-neutral-800 to-neutral-900">
              <Avatar className={cn("ring-2 ring-white/10", big ? "size-24" : "size-14 sm:size-16")}>
                {image && <AvatarImage src={image || "/placeholder.svg"} alt={name} />}
                <AvatarFallback className={cn("font-semibold text-white", getAvatarColor(tile.identity))}>
                  {getInitials(tile.kind === "local" ? tile.name : peer!.name)}
                </AvatarFallback>
              </Avatar>
            </div>
          </>
        )}

        {/* Badges */}
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
          {isHostTile && (
            <span className="rounded-full bg-live px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-live-foreground">
              Host
            </span>
          )}
          {isCohostTile && !isHostTile && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
              Co-host
            </span>
          )}
        </div>

        <TileMenu tile={tile} />

        {/* Speaking indicator — fades into the corner. */}
        <AnimatePresence>
          {speaking && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow"
            >
              <span className="flex gap-0.5">
                <span className="h-2 w-0.5 animate-pulse rounded-full bg-current" />
                <span className="h-2.5 w-0.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
                <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
              </span>
              Speaking
            </motion.div>
          )}
        </AnimatePresence>

        {/* Name + mic state */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6">
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-full",
              micActive ? "text-white" : "bg-neutral-700 text-white/80",
            )}
          >
            {micActive ? <Mic className="size-3" strokeWidth={2.5} /> : <MicOff className="size-3" strokeWidth={2.5} />}
          </span>
          <span className="truncate text-xs font-medium text-white">{name}</span>
        </div>
      </motion.div>
    )
  }

  // ── Host controls sheet ───────────────────────────────────────────────────
  const [hostSheet, setHostSheet] = useState(false)

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Arrival transition */}
      <AnimatePresence>
        {!arrived && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-neutral-950 px-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="size-28 overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/10"
            >
              {cover ? (
                <img src={cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center bg-primary/20 text-3xl font-bold text-primary">
                  {getInitials(title)}
                </div>
              )}
            </motion.div>
            <div>
              <p className="text-balance text-lg font-semibold">{title}</p>
              <p className="mt-0.5 text-sm text-white/60">Hosted by {hostName}</p>
            </div>
            <p className="flex items-center gap-2 text-sm text-white/50">
              <Radio className="size-4 animate-pulse text-live" /> Joining room…
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Exclusive Conversation header ──────────────────────────────────── */}
      <motion.header layout className={cn("z-30 shrink-0 border-b border-white/5 bg-neutral-950/80 backdrop-blur-xl")}>
        <div className="flex items-center justify-between px-3 pt-3">
          <div className="flex items-center gap-2">
            {backSlot}
            <span className="flex items-center gap-1.5 rounded-full bg-live/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-live">
              <span className="size-1.5 animate-pulse rounded-full bg-live" /> Live
            </span>
          </div>
          <div className="flex items-center gap-2">
            {pinnedCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium text-white/80">
                <Pin className="size-3" /> {pinnedCount}
              </span>
            )}
            {moreSlot}
          </div>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {collapsed ? (
            // Compact sticky header
            <motion.button
              key="compact"
              type="button"
              onClick={() => setCollapsed(false)}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
            >
              <div className="size-9 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10">
                {cover ? (
                  <img src={cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center bg-primary/20 text-xs font-bold text-primary">
                    {getInitials(title)}
                  </div>
                )}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{title}</span>
              </span>
              <span className="shrink-0 text-xs text-white/60">{participantCount} here</span>
            </motion.button>
          ) : (
            // Expanded header with centered cover art
            <motion.div
              key="expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col items-center gap-2 px-4 pb-4 pt-3 text-center"
            >
              <motion.button
                type="button"
                layoutId="conv-cover"
                onClick={() => cover && setLightbox(true)}
                whileTap={{ scale: 0.96 }}
                className="size-20 overflow-hidden rounded-2xl shadow-xl ring-1 ring-white/10"
              >
                {cover ? (
                  <img src={cover || "/placeholder.svg"} alt={`${title} cover art`} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center bg-primary/20 text-2xl font-bold text-primary">
                    {getInitials(title)}
                  </div>
                )}
              </motion.button>
              <div className="max-w-full">
                <h1 className="text-balance text-base font-semibold leading-tight">{title}</h1>
                {topic && (
                  <p className="mt-1 text-pretty text-sm text-white/75">
                    <span className="text-white/45">Today&apos;s Discussion · </span>
                    {topic}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-white/55">
                  Hosted by {hostName}
                  {category ? ` · ${category}` : ""}
                </p>
                <p className="mt-1 flex items-center justify-center gap-3 text-[11px] text-white/50">
                  <span>{participantCount} present</span>
                  {speakingCount > 0 && (
                    <span className="flex items-center gap-1 text-primary">
                      <Mic className="size-3" /> {speakingCount} speaking
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* ── Participant area ─────────────────────────────────────────────────── */}
      <motion.div layout className="relative min-h-0 flex-1">
        {/* Spotlight band */}
        {hasSpotlight && (
          <div className="flex flex-col gap-2 p-2 pb-0">
            <div className={cn("grid gap-2", spotlight.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {spotlight.map((tile) => (
                <div key={tile.identity} className="aspect-video">
                  <VideoTile tile={tile} big />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Paged grid of the remaining participants */}
        <div className="absolute inset-0 flex flex-col" style={hasSpotlight ? { top: "38%" } : undefined}>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div
                key={clampedPage}
                custom={dir}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.14}
                onDragEnd={(_e, info) => {
                  if (info.offset.x < -70 || info.velocity.x < -450) goto(clampedPage + 1)
                  else if (info.offset.x > 70 || info.velocity.x > 450) goto(clampedPage - 1)
                }}
                className="absolute inset-0 p-2"
              >
                <div
                  className="grid h-full gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                    gridAutoRows: "1fr",
                  }}
                >
                  <AnimatePresence mode="popLayout">
                    {pageTiles.map((tile) => (
                      <VideoTile key={tile.identity} tile={tile} />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Page arrows */}
            {pageCount > 1 && (
              <>
                {clampedPage > 0 && (
                  <button
                    type="button"
                    onClick={() => goto(clampedPage - 1)}
                    aria-label="Previous page"
                    className="absolute left-1 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                )}
                {clampedPage < pageCount - 1 && (
                  <button
                    type="button"
                    onClick={() => goto(clampedPage + 1)}
                    aria-label="Next page"
                    className="absolute right-1 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Page dots */}
          {pageCount > 1 && (
            <div className="flex shrink-0 items-center justify-center gap-1.5 py-1.5">
              {Array.from({ length: pageCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to page ${i + 1}`}
                  onClick={() => goto(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === clampedPage ? "w-5 bg-primary" : "w-1.5 bg-white/25 hover:bg-white/40",
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Floating chat messages (only when the panel is closed) */}
        <FloatingMessages messages={chatMessages} active={!chatOpen} />

        {/* Spotlight request prompt for the targeted participant */}
        {gridPinRequest?.userId === self.identity && (
          <div className="absolute inset-x-3 top-3 z-30 flex flex-col gap-2 rounded-2xl border border-white/10 bg-neutral-900/95 p-3 shadow-2xl backdrop-blur-xl">
            <p className="text-pretty text-sm font-medium">You&apos;ve been asked to be spotlighted.</p>
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
      </motion.div>

      {/* ── Bottom dock ──────────────────────────────────────────────────────── */}
      <div className="z-30 flex shrink-0 items-center justify-center gap-3 border-t border-white/5 bg-neutral-950/80 px-4 py-3 backdrop-blur-xl">
        <DockButton label={micOn ? "Mute" : "Unmute"} active={micOn} onClick={onToggleMic}>
          {micOn ? <Mic /> : <MicOff />}
        </DockButton>
        <DockButton label={camOn ? "Turn camera off" : "Turn camera on"} active={camOn} onClick={onToggleCam}>
          {camOn ? <Video /> : <VideoOff />}
        </DockButton>
        <DockButton label="Flip camera" onClick={onFlipCamera}>
          <SwitchCamera />
        </DockButton>
        <DockButton label="Open chat" onClick={() => setChatOpen(true)}>
          <MessageSquare />
        </DockButton>
        {isController && (
          <DockButton label="Host controls" onClick={() => setHostSheet(true)}>
            <Settings2 />
          </DockButton>
        )}
      </div>

      {/* ── Chat slide-up panel ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            key="chat"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="absolute inset-x-0 bottom-0 z-40 flex h-[55%] flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-neutral-950 shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-semibold">Live Chat</span>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
                className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <LiveChat
                asHost={isController}
                currentUser={currentUser}
                roomName={roomName}
                bgUrl={chatBgUrl}
                bgEffect={chatBgEffect}
                immersive
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Host controls sheet ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {hostSheet && isController && (
          <>
            <motion.button
              type="button"
              aria-label="Close host controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHostSheet(false)}
              className="absolute inset-0 z-40 cursor-default bg-black/50"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className="absolute inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-3xl border-t border-white/10 bg-neutral-950 p-5 shadow-2xl"
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
              <p className="text-sm font-semibold">Host controls</p>

              {/* Layout switcher */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/45">Layout</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(LAYOUTS) as GridLayout[]).map((key) => {
                    const L = LAYOUTS[key]
                    const Icon = L.icon
                    const active = gridLayout === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => run(`layout-${key}`, () => setGridLayout({ roomName, layout: key }))}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/15 text-white"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                        )}
                      >
                        <Icon className="size-5" />
                        {L.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                {onInvite && (
                  <SheetButton icon={UserPlus} label="Invite" onClick={() => (setHostSheet(false), onInvite())} />
                )}
                {onOpenMusic && (
                  <SheetButton icon={Music} label="Room audio" onClick={() => (setHostSheet(false), onOpenMusic())} />
                )}
                <SheetButton
                  icon={locked ? LockOpen : Lock}
                  label={locked ? "Unlock room" : "Lock room"}
                  onClick={() => run("lock", () => setRoomLock({ roomName, locked: !locked }))}
                />
                <SheetButton
                  icon={Radio}
                  label={prayerActive ? "End prayer" : "Prayer Mode"}
                  active={prayerActive}
                  onClick={() => run("prayer", () => setPrayerMode({ roomName, on: !prayerActive }))}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Prayer overlay + ended toast (shared with the audio Conversation) */}
      <PrayerOverlay active={prayerActive} endedAt={null} />

      {/* Cover-art lightbox — animates back into the header on close */}
      {lightbox && cover && <ImageLightbox src={cover} onClose={() => setLightbox(false)} />}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/10 disabled:opacity-50"
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
  onClick?: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-12 items-center justify-center rounded-full shadow-lg ring-1 ring-inset transition-all hover:scale-105 active:scale-95 [&>svg]:size-[22px]",
        active ? "bg-primary text-primary-foreground ring-white/25" : "bg-white/12 text-white ring-white/15 hover:bg-white/20",
      )}
    >
      {children}
    </button>
  )
}

function SheetButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Lock
  label: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-2xl border p-3.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/15 text-white" : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10",
      )}
    >
      <Icon className="size-5 shrink-0" />
      {label}
    </button>
  )
}
