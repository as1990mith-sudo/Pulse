"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { AnimatePresence, motion, type Variants } from "motion/react"
import {
  AlertTriangle,
  BookOpen,
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
  UserCheck,
  UserPlus,
  UserX,
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CoverArt } from "@/components/cover-art"
import { MarqueeTitle } from "@/components/marquee-title"
import { LiveChat } from "@/components/live-chat"
import { useLiveResourcesOptional } from "@/components/live/resource/resource-context"
import { FloatingMessages } from "@/components/conversation/floating-messages"
import { PrayerOverlay, PrayerEndedToast } from "@/components/conversation/prayer-overlay"
import {
  blockParticipant,
  getConversationState,
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
import { toggleFollow, getFollowingIds } from "@/app/actions/follow"
import { isMedianApp, openNativeAppSettings, type RemotePeer } from "@/lib/use-live-video"
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
  onRefreshState: () => void
  // Live media plumbing (owned by the parent hook).
  // Callback ref for the self-view <video>; re-attaches the camera track on every
  // mount so the local camera survives tile remounts (object refs don't).
  registerLocalVideoEl: (el: HTMLVideoElement | null) => void
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
  // Camera/mic error surfaced from the live hook (e.g. blocked permission), plus
  // a dismiss handler. Without this, a failed camera start is silent and the
  // host just keeps tapping the camera button with no explanation.
  rtcError?: string | null
  onClearError?: () => void
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
    onRefreshState,
    registerLocalVideoEl,
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
    rtcError = null,
    onClearError,
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

  // ── Follow the host from the header ───────────────────────────────────────
  // Participants (never the host themselves) can follow the host straight from
  // the LIVE row. Initial follow state is fetched once on mount.
  const canFollowHost = Boolean(currentUser) && !!hostId && !amHost
  const [following, setFollowing] = useState(false)
  const [followPending, setFollowPending] = useState(false)
  useEffect(() => {
    if (!canFollowHost || !hostId) return
    let cancelled = false
    getFollowingIds()
      .then((ids) => !cancelled && setFollowing(ids.includes(hostId)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [canFollowHost, hostId])
  async function handleToggleFollowHost() {
    if (!hostId || followPending) return
    const next = !following
    setFollowing(next)
    setFollowPending(true)
    try {
      await toggleFollow({ targetUserId: hostId, follow: next })
    } catch {
      setFollowing(!next)
    } finally {
      setFollowPending(false)
    }
  }

  // ── Synced room state (prayer / lock / layout). One lightweight poll shared
  //    by every client so the host's choices apply to everyone in real time. ──
  const { data: roomState, mutate: mutateRoomState } = useSWR(
    roomName && connected ? ["conv-video-state", roomName] : null,
    () => getConversationState({ roomName }),
    { refreshInterval: 2000, revalidateOnFocus: false },
  )
  const gridLayout: GridLayout = roomState?.gridLayout ?? "balanced"
  const prayerActive = !!roomState?.prayerStartedAt
  const locked = !!roomState?.locked
  // Chat panel state lives here (above the layout resolution) because opening
  // the chatroom forces the grid into a compact reflow.
  const [chatOpen, setChatOpen] = useState(false)
  // Everyone normally shares the host-selected layout. But the moment a user
  // opens their chatroom, the grid reflows into the compact 3-column layout
  // regardless of that selection, so tiles stay legible in the narrower space
  // beside the open chat panel.
  const layout = chatOpen ? LAYOUTS.compact : (LAYOUTS[gridLayout] ?? LAYOUTS.balanced)

  // When a controller changes shared state, refresh both this poll and the
  // parent's call-state poll so the whole room converges quickly.
  const refreshAll = useCallback(() => {
    void mutateRoomState()
    onRefreshState()
  }, [mutateRoomState, onRefreshState])

  // ── Stable per-identity <video> ref callbacks ────────────────────────────
  // An inline `ref={(el) => registerPeerVideoEl(id, el)}` gets a new identity on
  // every render, so React re-runs it (null → element) each time and the peer
  // track re-attaches — the video visibly restarts. Caching one callback per
  // identity keeps the ref stable, so React only runs it on real mount/unmount.
  const peerRefCbs = useRef<Map<string, (el: HTMLVideoElement | null) => void>>(new Map())
  const getPeerRef = useCallback(
    (identity: string) => {
      const map = peerRefCbs.current
      let cb = map.get(identity)
      if (!cb) {
        cb = (el: HTMLVideoElement | null) => registerPeerVideoEl(identity, el)
        map.set(identity, cb)
      }
      return cb
    },
    [registerPeerVideoEl],
  )

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

  const [page, setPage] = useState(0)
  const [dir, setDir] = useState(0)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  // Study-resources drawer opener (present on every live). Sits in the dock
  // just before the chat button.
  const resources = useLiveResourcesOptional()

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
      refreshAll()
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
        key={tile.identity}
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
        {/* The <video> element is ALWAYS mounted (only hidden when the camera is
            off). This avoids a chicken-and-egg deadlock: the hook needs the
            element to exist before it can attach the track and flip
            localVideoReady, but the element used to be conditionally rendered on
            localVideoReady — so the host's camera never appeared. Keeping it
            mounted lets the track attach immediately and stay attached across
            cam on/off toggles. */}
        {tile.kind === "local" ? (
          <video
            ref={registerLocalVideoEl}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 size-full object-cover",
              facingMode === "user" && "-scale-x-100",
              !camActive && "opacity-0",
            )}
          />
        ) : (
          <video
            ref={getPeerRef(tile.identity)}
            autoPlay
            playsInline
            className={cn("absolute inset-0 size-full object-cover", !camActive && "opacity-0")}
          />
        )}
        {!camActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-neutral-800 to-neutral-900">
            <Avatar className={cn("ring-2 ring-white/10", big ? "size-24" : "size-14 sm:size-16")}>
              {image && <AvatarImage src={image || "/placeholder.svg"} alt={name} />}
              <AvatarFallback className={cn("font-semibold text-white", getAvatarColor(tile.identity))}>
                {getInitials(tile.kind === "local" ? tile.name : peer!.name)}
              </AvatarFallback>
            </Avatar>
          </div>
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

        {TileMenu({ tile })}

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
            {canFollowHost && (
              <button
                type="button"
                onClick={() => void handleToggleFollowHost()}
                disabled={followPending}
                aria-label={following ? `Unfollow ${hostName}` : `Follow ${hostName}`}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60",
                  following
                    ? "bg-white/10 text-white/80 ring-1 ring-inset ring-white/15"
                    : "bg-live text-live-foreground",
                )}
              >
                {following ? <UserCheck className="size-3" /> : <UserPlus className="size-3" />}
                {following ? "Following" : "Follow"}
              </button>
            )}
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
              <MarqueeTitle text={title} className="min-w-0 flex-1 text-sm font-semibold" />
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
              {cover ? (
                <CoverArt src={cover} alt={`${title} cover art`} className="size-20" />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary shadow-xl ring-2 ring-black">
                  {getInitials(title)}
                </div>
              )}
              {/* Tapping the title/details collapses the header back to the
                  compact bar (the compact bar re-expands it), giving a clear
                  two-way toggle. The cover art keeps its own lightbox action. */}
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse room details"
                className="max-w-full"
              >
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
              </button>
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
                  {VideoTile({ tile, big: true })}
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
                    {pageTiles.map((tile) => VideoTile({ tile }))}
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

      {/* ── Chat panel ────────────────────────────���──────────────────────────
          In-flow (not an overlay): it grows from the bottom and the participant
          area above smoothly shrinks/reflows so an open chat never covers a
          single participant. */}
      <AnimatePresence initial={false}>
        {chatOpen && (
          <motion.section
            key="chat"
            initial={{ height: "0vh", opacity: 0 }}
            animate={{ height: "45vh", opacity: 1 }}
            exit={{ height: "0vh", opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="relative z-40 flex min-h-0 shrink-0 flex-col overflow-hidden border-t border-white/10 bg-neutral-950"
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
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Camera / mic error banner ────────────────────────────────────────
          Surfaces a failed camera start (blocked permission, camera in use,
          timeout) so the host isn't left tapping the camera button with no
          feedback. Offers an inline retry and — inside the in-app WebView, where
          a denied OS permission can't be re-prompted from the page — a shortcut
          to the native app settings. */}
      <AnimatePresence>
        {rtcError && (
          <motion.div
            key="rtc-error"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="z-30 shrink-0 overflow-hidden border-t border-destructive/40 bg-destructive/15"
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-pretty text-sm leading-relaxed text-white">{rtcError}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleCam}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 transition-transform active:scale-95"
                  >
                    Try again
                  </button>
                  {isMedianApp() && (
                    <button
                      type="button"
                      onClick={() => openNativeAppSettings()}
                      className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/25"
                    >
                      Open settings
                    </button>
                  )}
                </div>
              </div>
              {onClearError && (
                <button
                  type="button"
                  onClick={onClearError}
                  aria-label="Dismiss"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        {resources && (
          <DockButton label="Study resources" onClick={() => resources.openDrawer()}>
            <BookOpen />
          </DockButton>
        )}
        <DockButton label={chatOpen ? "Close chat" : "Open chat"} active={chatOpen} onClick={() => setChatOpen((v) => !v)}>
          <MessageSquare />
        </DockButton>
        {isController && (
          <DockButton label="Host controls" onClick={() => setHostSheet(true)}>
            <Settings2 />
          </DockButton>
        )}
      </div>

      {/* ── Host controls sheet ────────────────────────────────���─────────────── */}
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
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                          "flex w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/15 text-white"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                        )}
                      >
                        <Icon className="size-5" />
                        <span className="text-center leading-tight text-pretty">{L.label}</span>
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
