"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronUp, Maximize2, Radio, X } from "lucide-react"
import { StudioConsole } from "@/components/studio-console"
import { LiveListener } from "@/components/live-listener"
import { VideoStudioConsole } from "@/components/video-studio-console"
import { LiveVideoViewer } from "@/components/live-video-viewer"
import { ConversationRoom } from "@/components/conversation-room"
import { StudioErrorBoundary } from "@/components/studio-error-boundary"
import type { CurrentUser } from "@/lib/session"
import type { LiveStreamView } from "@/app/actions/live"
import { cn } from "@/lib/utils"
import { ResourceProvider, useLiveResources, type LiveDescriptor } from "@/components/live/resource/resource-context"
import { LiveResourceLayer, DesktopResourceDock } from "@/components/live/resource/live-resource-layer"

/**
 * A live audio session is hosted at the app level (above the router) so that
 * audio keeps playing while the room is minimised and the user browses other
 * tabs. LiveKit attaches its <audio> elements to document.body, so simply
 * keeping the room component mounted (just visually hidden) preserves playback.
 */
type HostSession = {
  kind: "host"
  key: string
  currentUser: CurrentUser
  // Set when the host is rejoining an already-live stream of theirs.
  resumeStream?: LiveStreamView | null
}
type ListenerSession = {
  kind: "listener"
  key: string
  stream: LiveStreamView
  canListen: boolean
  currentUser: CurrentUser | null
  currentUserId: string | null
}
type HostVideoSession = {
  kind: "host-video"
  key: string
  currentUser: CurrentUser
  resumeStream?: LiveStreamView | null
}
type ViewerVideoSession = {
  kind: "viewer-video"
  key: string
  stream: LiveStreamView
  canWatch: boolean
  currentUser: CurrentUser | null
  currentUserId: string | null
  initialFollowing: boolean
}
// Conversation (community-gathering) audio room. One unified room component
// serves both the host and speaking participants; role is derived from ids.
type ConversationHostSession = {
  kind: "conversation-host"
  key: string
  currentUser: CurrentUser
  resumeStream?: LiveStreamView | null
}
type ConversationParticipantSession = {
  kind: "conversation-participant"
  key: string
  stream: LiveStreamView
  canJoin: boolean
  currentUser: CurrentUser | null
  currentUserId: string | null
}
type Session =
  | HostSession
  | ListenerSession
  | HostVideoSession
  | ViewerVideoSession
  | ConversationHostSession
  | ConversationParticipantSession

export type LiveMeta = {
  title: string
  cover: string | null
  live: boolean
  subtitle?: string
  // The live room name, surfaced once the room actually connects. Fresh host
  // sessions have no stream yet, so this is how the resource system learns the
  // room to scope to (and thus when to show the floating resource button).
  roomName?: string | null
}

type Ctx = {
  open: (s: Session) => void
  close: () => void
  minimize: (to?: string) => void
  expand: () => void
  setMeta: (m: LiveMeta) => void
  activeKey: string | null
}

const LiveSessionContext = createContext<Ctx | null>(null)

export function useLiveSession() {
  const ctx = useContext(LiveSessionContext)
  if (!ctx) throw new Error("useLiveSession must be used within LiveSessionProvider")
  return ctx
}

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [meta, setMetaState] = useState<LiveMeta | null>(null)

  const open = useCallback((s: Session) => {
    setSession((prev) => (prev && prev.key === s.key && prev.kind === s.kind ? prev : s))
    setMinimized(false)
  }, [])

  const close = useCallback(() => {
    setSession(null)
    setMinimized(false)
    setMetaState(null)
    router.push("/live")
  }, [router])

  // Minimise the immersive room (keeping audio alive) and navigate. Defaults to
  // the live listing, but callers can pass a destination (e.g. a DM thread) so
  // we perform a single navigation instead of racing two router.push calls.
  const minimize = useCallback(
    (to: string = "/live") => {
      setMinimized(true)
      router.push(to)
    },
    [router],
  )

  const expand = useCallback(() => setMinimized(false), [])
  const setMeta = useCallback((m: LiveMeta) => setMetaState(m), [])

  // Minimise behaviour splits by format:
  //  • VIDEO (host-video / viewer-video) collapses into a floating, draggable
  //    Picture-in-Picture window that keeps the live video visible.
  //  • AUDIO (podcast host/listener, conversation) collapses into a floating,
  //    draggable mini-player pill.
  const isVideo = session?.kind === "host-video" || session?.kind === "viewer-video"
  const videoMini = Boolean(session) && minimized && isVideo
  const audioMini = Boolean(session) && minimized && !isVideo

  // While the audio mini-player is docked at the bottom, reserve its height as
  // bottom padding on <body> so page content never scrolls behind its resting
  // position. (The video PiP floats freely and needs no reservation.)
  const miniPlayerShown = audioMini && Boolean(meta)

  const roomChildren = session ? (
    <LiveRoomBody session={session} minimize={minimize} close={close} setMeta={setMeta} />
  ) : null
  useEffect(() => {
    if (!miniPlayerShown) return
    const body = document.body
    const prev = body.style.paddingBottom
    body.style.paddingBottom = "calc(5.25rem + env(safe-area-inset-bottom))"
    return () => {
      body.style.paddingBottom = prev
    }
  }, [miniPlayerShown])

  // While the immersive room is open (and not minimised), lock the document so
  // touch/scroll gestures can't move the page behind the fixed overlay. Locking
  // <html> overflow + overscroll-behavior prevents both the scroll and the
  // rubber-band/chaining that was leaking through to the underlying page.
  const roomOpen = Boolean(session) && !minimized
  useEffect(() => {
    if (!roomOpen) return
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    }
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    html.style.overscrollBehavior = "none"
    body.style.overscrollBehavior = "none"
    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      html.style.overscrollBehavior = prev.htmlOverscroll
      body.style.overscrollBehavior = prev.bodyOverscroll
    }
  }, [roomOpen])

  return (
    <LiveSessionContext.Provider
      value={{ open, close, minimize, expand, setMeta, activeKey: session?.key ?? null }}
    >
      {children}

      {/* The live room lives here, above the router. Hidden (but kept mounted)
          when minimised so the audio connection — and playback — survive.
          Wrapped in ResourceProvider so the universal resource drawer + floating
          mini panels (Bible, Notes, PDFs, Books, Pinned, Prayer) overlay every
          live format without ever navigating away. */}
      {session && (
        <ResourceProvider descriptor={deriveDescriptor(session, meta)}>
          {/* One always-mounted stage. Video-live minimise re-styles it in place
              into a floating draggable PiP (the live video keeps playing);
              swapping to a differently-wrapped element would remount the room
              and tear down the LiveKit tracks. */}
          <LiveRoomStage
            minimized={minimized}
            pip={videoMini ? { onExpand: expand, onClose: close, title: meta?.title, live: meta?.live } : null}
          >
            {roomChildren}
          </LiveRoomStage>
        </ResourceProvider>
      )}

      {session && audioMini && meta && <MiniPlayer meta={meta} onExpand={expand} />}
    </LiveSessionContext.Provider>
  )
}

/**
 * The immersive room body for the active session. Extracted so it can be
 * rendered either full-screen (normal / audio-minimised) or inside the floating
 * video PiP frame without duplicating the per-kind switch.
 */
function LiveRoomBody({
  session,
  minimize,
  close,
  setMeta,
}: {
  session: Session
  minimize: (to?: string) => void
  close: () => void
  setMeta: (m: LiveMeta) => void
}) {
  return (
    <>
          {session.kind === "host" ? (
            <StudioErrorBoundary>
              <div className="flex h-dvh flex-col overflow-hidden">
                <StudioConsole
                  currentUser={session.currentUser}
                  resumeStream={session.resumeStream}
                  onMinimize={minimize}
                  onExit={close}
                  onMeta={setMeta}
                />
              </div>
            </StudioErrorBoundary>
          ) : session.kind === "host-video" ? (
            <StudioErrorBoundary>
              <div className="flex h-dvh flex-col overflow-hidden">
                <VideoStudioConsole
                  currentUser={session.currentUser}
                  resumeStream={session.resumeStream}
                  onMinimize={minimize}
                  onExit={close}
                  onMeta={setMeta}
                />
              </div>
            </StudioErrorBoundary>
          ) : session.kind === "viewer-video" ? (
            <div className="flex h-dvh flex-col overflow-hidden">
              <LiveVideoViewer
                stream={session.stream}
                canWatch={session.canWatch}
                currentUser={session.currentUser}
                currentUserId={session.currentUserId}
                initialFollowing={session.initialFollowing}
                onMinimize={minimize}
                onExit={close}
                onMeta={setMeta}
              />
            </div>
          ) : session.kind === "conversation-host" ? (
            <StudioErrorBoundary>
              <div className="h-dvh">
                <ConversationRoom
                  mode="host"
                  currentUser={session.currentUser}
                  resumeStream={session.resumeStream}
                  onMinimize={minimize}
                  onExit={close}
                  onMeta={setMeta}
                />
              </div>
            </StudioErrorBoundary>
          ) : session.kind === "conversation-participant" ? (
            <div className="h-dvh">
              <ConversationRoom
                mode="participant"
                stream={session.stream}
                canJoin={session.canJoin}
                currentUser={session.currentUser}
                currentUserId={session.currentUserId}
                onMinimize={minimize}
                onExit={close}
                onMeta={setMeta}
              />
            </div>
          ) : (
            <div className="h-dvh">
              <LiveListener
                stream={session.stream}
                canListen={session.canListen}
                currentUser={session.currentUser}
                currentUserId={session.currentUserId}
                onMinimize={minimize}
                onExit={close}
                onMeta={setMeta}
              />
            </div>
          )}
    </>
  )
}

/**
 * Layout shell for the immersive live room.
 *
 * - Mobile: unchanged — the room is a full-screen overlay covering the viewport.
 * - Desktop (lg+): the room is centred in a framed column (matching the feed's
 *   centred reading width) instead of stretching edge to edge. When a resource
 *   panel is open the room shifts narrower and the panel docks to its right, the
 *   two centred together as a single group.
 *
 * Rendered inside ResourceProvider so it can react to the active resource panel.
 */
/** Config for the floating video PiP; null when the stage is not a video-mini. */
type PipConfig = { onExpand: () => void; onClose: () => void; title?: string; live?: boolean }

function LiveRoomStage({
  minimized,
  pip,
  children,
}: {
  minimized: boolean
  pip: PipConfig | null
  children: React.ReactNode
}) {
  const { activePanel } = useLiveResources()
  const docked = Boolean(activePanel)
  const { ref, pos, moved, handlers } = useDraggable()
  const active = Boolean(pip)
  const scale = 0.4

  return (
    <div
      ref={ref}
      {...(active ? handlers : {})}
      className={cn(
        active
          ? cn(
              "fixed z-[60] cursor-grab touch-none select-none overflow-hidden rounded-3xl bg-black shadow-2xl ring-1 ring-white/20 active:cursor-grabbing",
              // Default resting spot: bottom-right, clearing the footer + safe area.
              !pos && "bottom-[calc(env(safe-area-inset-bottom,0px)+var(--bottom-nav-height,0px)+0.75rem)] right-3",
            )
          : "fixed inset-0 z-[60] overscroll-contain lg:flex lg:justify-center lg:overflow-hidden lg:bg-black",
      )}
      style={
        active
          ? { width: `calc(100vw * ${scale})`, height: `calc(100dvh * ${scale})`, ...(pos ? { left: pos.x, top: pos.y } : {}) }
          : minimized
            ? { display: "none" }
            : undefined
      }
      aria-hidden={minimized && !active}
    >
      {/* Transform layer: transparent to layout normally (display:contents), and a
          scaled 100vw×100dvh box when floating as PiP. Permanently mounted so the
          live video DOM never tears down when toggling in/out of PiP. A
          transformed element also becomes the containing block for the room's
          inner fixed layers, so they scale with it. */}
      <div
        className={active ? "pointer-events-none absolute left-0 top-0 origin-top-left" : "contents"}
        style={active ? { width: "100vw", height: "100dvh", transform: `scale(${scale})` } : undefined}
      >
        {/* Room column: full-screen on mobile, centred framed column on desktop. */}
        <div
          className={cn(
            "relative h-dvh w-full overflow-hidden bg-black lg:h-dvh lg:shrink-0 lg:border-x lg:border-white/10",
            docked ? "lg:w-[600px]" : "lg:w-[680px]",
          )}
        >
          {children}
          {/* Universal resource layer: drawer picker + floating mini-panel (mobile). */}
          <LiveResourceLayer />
        </div>
      </div>

      {/* Desktop-only right dock (renders nothing until a panel is open). */}
      {!active && <DesktopResourceDock />}

      {/* PiP chrome: tap-anywhere-to-expand surface + corner expand/close. */}
      {active && pip && (
        <>
          <button
            type="button"
            aria-label={pip.title ? `Expand live: ${pip.title}` : "Expand live session"}
            onClick={() => {
              if (!moved.current) pip.onExpand()
            }}
            className="absolute inset-0 z-10"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-1.5">
            {pip.live ? (
              <span className="flex items-center gap-1 rounded-full bg-live px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-live-foreground shadow">
                <span className="size-1 animate-pulse rounded-full bg-current" />
                Live
              </span>
            ) : (
              <span />
            )}
            <div className="pointer-events-auto flex items-center gap-1">
              <button
                type="button"
                data-no-drag
                onClick={pip.onExpand}
                aria-label="Expand live session"
                className="flex size-7 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-inset ring-white/20 backdrop-blur-md transition-transform active:scale-90"
              >
                <Maximize2 className="size-3.5" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                data-no-drag
                onClick={pip.onClose}
                aria-label="Close live session"
                className="flex size-7 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-inset ring-white/20 backdrop-blur-md transition-transform active:scale-90"
              >
                <X className="size-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Build the descriptor the resource system uses to tag notes/pins/prayers and to
 * decide whether the current user is the host. Viewer/listener sessions carry the
 * full stream; host sessions carry an optional resumeStream (a brand-new
 * broadcast has no room yet, so we return null and the resource button stays
 * hidden until the room is live and meta is set). `meta.title` (set once the room
 * connects) is preferred for the session title when available.
 */
function deriveDescriptor(session: Session, meta: LiveMeta | null): LiveDescriptor {
  const stream =
    "stream" in session
      ? session.stream
      : "resumeStream" in session
        ? (session.resumeStream ?? null)
        : null

  const currentUser = session.currentUser ?? null
  const viewerId = "currentUserId" in session ? session.currentUserId : (currentUser?.id ?? null)
  const isHost =
    session.kind === "host" ||
    session.kind === "host-video" ||
    session.kind === "conversation-host" ||
    (viewerId != null && stream != null && viewerId === stream.hostId)

  return {
    // Prefer the live room name reported by the room once it connects (a fresh
    // host broadcast has no stream yet), falling back to the stream. Stays null
    // only until the room is live, keeping the resource button hidden until then.
    roomName: meta?.roomName ?? stream?.roomName ?? null,
    streamId: stream?.id ?? null,
    hostId: stream?.hostId ?? null,
    hostName: stream?.hostName ?? null,
    topic: stream?.topic ?? null,
    sessionTitle: meta?.title ?? stream?.title ?? null,
    mode: stream?.mode ?? null,
    isHost,
    currentUser,
  }
}

/**
 * Pointer-based free-drag for a floating minimised surface (audio mini-player or
 * video PiP). Returns a ref to attach to the draggable element, its explicit
 * position once moved (`null` = use the CSS default anchor), a `moved` ref so a
 * concluding click can tell a drag from a tap, and the pointer handlers.
 *
 * The gesture uses pointer capture and only commits to a drag after a small
 * threshold, so taps still register. Position is clamped inside the viewport.
 */
function useDraggable() {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const moved = useRef(false)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Real controls (marked data-no-drag) should click, not start a drag.
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top }
    moved.current = false
    el.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    const el = ref.current
    if (!d || !el || e.pointerId !== d.id) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!moved.current && Math.hypot(dx, dy) < 6) return // below threshold — still a tap
    moved.current = true
    const w = el.offsetWidth
    const h = el.offsetHeight
    setPos({
      x: Math.max(8, Math.min(d.originX + dx, window.innerWidth - w - 8)),
      y: Math.max(8, Math.min(d.originY + dy, window.innerHeight - h - 8)),
    })
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    ref.current?.releasePointerCapture?.(e.pointerId)
    drag.current = null
  }

  return {
    ref,
    pos,
    moved,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}

/**
 * Floating, draggable mini-player pill for a minimised AUDIO session. Rests
 * centred just above the footer nav; the user can drag it anywhere. Tapping the
 * pill (without dragging) returns to the immersive room.
 */
function MiniPlayer({ meta, onExpand }: { meta: LiveMeta; onExpand: () => void }) {
  const { ref, pos, moved, handlers } = useDraggable()

  return (
    <div
      ref={ref}
      {...handlers}
      role="button"
      tabIndex={0}
      aria-label={`Expand live session: ${meta.title}`}
      onClick={() => {
        if (!moved.current) onExpand()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onExpand()
        }
      }}
      className={cn(
        "fixed z-[55] flex w-[min(92vw,26rem)] cursor-grab touch-none select-none items-center gap-3 rounded-2xl border border-white/15 bg-zinc-900/95 p-2.5 text-left shadow-2xl ring-1 ring-black/40 backdrop-blur-xl transition-transform active:scale-[0.99] active:cursor-grabbing",
        // Default resting spot: bottom-centred, above the footer nav + safe area.
        !pos && "bottom-[calc(env(safe-area-inset-bottom,0px)+var(--bottom-nav-height,0px)+0.5rem)] left-1/2 -translate-x-1/2",
      )}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/10">
        {meta.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
        ) : (
          <Radio className="size-5 text-white/70" strokeWidth={2.5} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {meta.live && (
            <span className="flex items-center gap-1 rounded-full bg-live px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-live-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-current" /> Live
            </span>
          )}
          <span className="truncate text-sm font-bold text-white">{meta.title}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs font-medium text-white/55">
          {meta.subtitle ?? "Tap to return · drag to move"}
        </span>
      </span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/15">
        <ChevronUp className="size-5" strokeWidth={2.5} />
      </span>
    </div>
  )
}

/** Mounts a host studio session into the app-level provider. */
export function HostStudioLauncher({
  currentUser,
  resumeStream,
}: {
  currentUser: CurrentUser
  resumeStream?: LiveStreamView | null
}) {
  const { open } = useLiveSession()
  useEffect(() => {
    // A resume session is keyed to its room so it's distinct from a fresh host
    // session (and won't be deduped against an already-open studio).
    const key = resumeStream ? `host:${resumeStream.roomName}` : "host"
    open({ kind: "host", key, currentUser, resumeStream })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeStream?.roomName])
  return null
}

/** Mounts a listener session into the app-level provider. */
export function ListenerLauncher({
  stream,
  canListen,
  currentUser,
  currentUserId,
}: {
  stream: LiveStreamView
  canListen: boolean
  currentUser: CurrentUser | null
  currentUserId: string | null
}) {
  const { open } = useLiveSession()
  useEffect(() => {
    open({ kind: "listener", key: `listener:${stream.roomName}`, stream, canListen, currentUser, currentUserId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.roomName])
  return null
}

/** Mounts a host *video* studio session into the app-level provider. */
export function HostVideoStudioLauncher({
  currentUser,
  resumeStream,
}: {
  currentUser: CurrentUser
  resumeStream?: LiveStreamView | null
}) {
  const { open } = useLiveSession()
  useEffect(() => {
    const key = resumeStream ? `host-video:${resumeStream.roomName}` : "host-video"
    open({ kind: "host-video", key, currentUser, resumeStream })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeStream?.roomName])
  return null
}

/** Mounts a video viewer session into the app-level provider. */
export function VideoViewerLauncher({
  stream,
  canWatch,
  currentUser,
  currentUserId,
  initialFollowing,
}: {
  stream: LiveStreamView
  canWatch: boolean
  currentUser: CurrentUser | null
  currentUserId: string | null
  initialFollowing: boolean
}) {
  const { open } = useLiveSession()
  useEffect(() => {
    open({
      kind: "viewer-video",
      key: `viewer-video:${stream.roomName}`,
      stream,
      canWatch,
      currentUser,
      currentUserId,
      initialFollowing,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.roomName])
  return null
}

/** Mounts a Conversation room as the host into the app-level provider. */
export function HostConversationLauncher({
  currentUser,
  resumeStream,
}: {
  currentUser: CurrentUser
  resumeStream?: LiveStreamView | null
}) {
  const { open } = useLiveSession()
  useEffect(() => {
    const key = resumeStream ? `conversation-host:${resumeStream.roomName}` : "conversation-host"
    open({ kind: "conversation-host", key, currentUser, resumeStream })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeStream?.roomName])
  return null
}

/** Mounts a Conversation room as a speaking participant into the provider. */
export function ConversationParticipantLauncher({
  stream,
  canJoin,
  currentUser,
  currentUserId,
}: {
  stream: LiveStreamView
  canJoin: boolean
  currentUser: CurrentUser | null
  currentUserId: string | null
}) {
  const { open } = useLiveSession()
  useEffect(() => {
    open({
      kind: "conversation-participant",
      key: `conversation-participant:${stream.roomName}`,
      stream,
      canJoin,
      currentUser,
      currentUserId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.roomName])
  return null
}
