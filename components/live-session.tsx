"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronUp, Radio } from "lucide-react"
import { StudioConsole } from "@/components/studio-console"
import { LiveListener } from "@/components/live-listener"
import { VideoStudioConsole } from "@/components/video-studio-console"
import { LiveVideoViewer } from "@/components/live-video-viewer"
import { StudioErrorBoundary } from "@/components/studio-error-boundary"
import type { CurrentUser } from "@/lib/session"
import type { LiveStreamView } from "@/app/actions/live"
import { cn } from "@/lib/utils"

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
type Session = HostSession | ListenerSession | HostVideoSession | ViewerVideoSession

export type LiveMeta = { title: string; cover: string | null; live: boolean; subtitle?: string }

type Ctx = {
  open: (s: Session) => void
  close: () => void
  minimize: () => void
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

  const minimize = useCallback(() => {
    setMinimized(true)
    router.push("/live")
  }, [router])

  const expand = useCallback(() => setMinimized(false), [])
  const setMeta = useCallback((m: LiveMeta) => setMetaState(m), [])

  // While a session is minimised, the MiniPlayer is pinned to the bottom of the
  // viewport. Reserve its height as bottom padding on <body> so page content
  // never scrolls behind it — the bar acts as a hard floor for the layout.
  const miniPlayerShown = Boolean(session) && minimized && Boolean(meta)
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
          when minimised so the audio connection — and playback — survive. */}
      {session && (
        <div
          className="fixed inset-0 z-[60] overscroll-contain"
          style={minimized ? { display: "none" } : undefined}
          aria-hidden={minimized}
        >
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
        </div>
      )}

      {session && minimized && meta && <MiniPlayer meta={meta} onExpand={expand} />}
    </LiveSessionContext.Provider>
  )
}

/** Persistent bar pinned to the bottom while a session is minimised. */
function MiniPlayer({ meta, onExpand }: { meta: LiveMeta; onExpand: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Expand live session: ${meta.title}`}
        className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-white/15 bg-zinc-900/95 p-2.5 text-left shadow-2xl ring-1 ring-black/40 backdrop-blur-xl transition-transform active:scale-[0.99]"
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
            {meta.subtitle ?? "Tap to return to the room"}
          </span>
        </span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/15">
          <ChevronUp className="size-5" strokeWidth={2.75} />
        </span>
      </button>
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
