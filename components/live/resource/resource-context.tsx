"use client"

// The shared state for the Live Resource system. One provider is mounted per
// live session (inside LiveSessionProvider), so every mini-panel and the drawer
// read the same live descriptor and share a single "active panel" — enforcing
// the rule that only ONE mini-panel is open at a time. Rooms register their chat
// sender here so panels (e.g. the mini-Bible) can share a verse into the live's
// own chat without leaving the live.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { CurrentUser } from "@/lib/session"
import { sendLiveChat, type LiveChatMessageMeta } from "@/app/actions/live"

export type ResourcePanelId = "bible" | "notes" | "pdf" | "books" | "pinned"

// Optional payload handed to a panel when it opens (e.g. open the PDF panel on a
// specific document, or the Bible panel on a specific verse).
export type PanelPayload =
  | { kind: "pdf"; url: string; title: string; downloadName?: string }
  | { kind: "book"; productId: number; title: string }
  | { kind: "bible"; verseId?: string; book?: string; chapter?: number; verse?: number }
  | null

// Everything a panel needs to know about the live it is overlaying.
export type LiveDescriptor = {
  roomName: string | null
  streamId: number | null
  hostId: string | null
  hostName: string | null
  topic: string | null
  sessionTitle: string | null
  mode: "audio" | "video" | null
  isHost: boolean
  currentUser: CurrentUser | null
}

// A room's chat sender. `meta` carries a rich payload (e.g. a shared Bible
// verse) so panels can post a structured card instead of only plain text.
type ChatSender = (text: string, meta?: LiveChatMessageMeta | null) => void | Promise<void>

// How the host console publishes/unpublishes the shared-video tracks (audio, and
// the projected PIXELS) so the egress records the Project Video into the replay.
export type VideoAudioSink = {
  publish: (track: MediaStreamTrack) => Promise<void>
  unpublish: () => Promise<void>
  publishVideo: (track: MediaStreamTrack) => Promise<void>
  unpublishVideo: () => Promise<void>
}

type ResourceCtx = {
  descriptor: LiveDescriptor
  activePanel: ResourcePanelId | null
  payload: PanelPayload
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  openPanel: (id: ResourcePanelId, payload?: PanelPayload) => void
  closePanel: () => void
  // Rooms call this to expose their "post a chat message" function. Returns an
  // unregister cleanup. When no sender is registered, shareToChat resolves false
  // and callers fall back to the native share sheet.
  registerChatSender: (fn: ChatSender) => () => void
  shareToChat: (text: string, meta?: LiveChatMessageMeta | null) => Promise<boolean>
  canShareToChat: boolean
  // The host console (which owns the LiveKit room) registers how to publish the
  // shared-video audio so the egress recording captures it. The video panel
  // calls publishVideoAudio with a Web Audio track tapped off its <video>, and
  // unpublishVideoAudio when the video stops/replaces. No-ops when unregistered
  // (e.g. the viewer side, which never publishes).
  registerVideoAudioSink: (sink: VideoAudioSink) => () => void
  publishVideoAudio: (track: MediaStreamTrack) => Promise<void>
  unpublishVideoAudio: () => Promise<void>
  // Same, for the projected video PIXELS (egress-only replay capture).
  publishVideoPixels: (track: MediaStreamTrack) => Promise<void>
  unpublishVideoPixels: () => Promise<void>
  // While a host is actively PLAYING a shared video, the panel is locked for
  // participants: they can't close it, minimise it to the drawer, or switch to
  // another resource — the room watches together. Dragging the card and
  // minimising the live session itself stay allowed. The video panel is the
  // single source of truth and toggles this; the context enforces it centrally
  // so every entry point (buttons, switcher, drawer) obeys the same rule.
  videoLocked: boolean
  setVideoLocked: (v: boolean) => void
}

const Ctx = createContext<ResourceCtx | null>(null)

export function useLiveResources() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useLiveResources must be used within a ResourceProvider")
  return ctx
}

/** Optional variant for components that may render outside a live. */
export function useLiveResourcesOptional() {
  return useContext(Ctx)
}

export function ResourceProvider({
  descriptor,
  children,
}: {
  descriptor: LiveDescriptor
  children: React.ReactNode
}) {
  const [activePanel, setActivePanel] = useState<ResourcePanelId | null>(null)
  const [payload, setPayload] = useState<PanelPayload>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [senderCount, setSenderCount] = useState(0)
  const [videoLocked, setVideoLocked] = useState(false)
  const senderRef = useRef<ChatSender | null>(null)
  // Read in the stable callbacks below so they always see the current lock
  // without being torn down and recreated when it flips.
  const lockedRef = useRef(false)
  lockedRef.current = videoLocked

  // Opening the drawer is a form of minimising the panel, so it's blocked while
  // the video is locked.
  const openDrawer = useCallback(() => {
    if (lockedRef.current) return
    setDrawerOpen(true)
  }, [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const openPanel = useCallback((id: ResourcePanelId, p: PanelPayload = null) => {
    // Locking is retained for safety but is inert now that the shared-video
    // resource has been removed (nothing ever sets videoLocked true).
    if (lockedRef.current) return
    setPayload(p)
    setActivePanel(id)
    setDrawerOpen(false)
  }, [])

  const closePanel = useCallback(() => {
    if (lockedRef.current) return
    setActivePanel(null)
    setPayload(null)
  }, [])

  const registerChatSender = useCallback((fn: ChatSender) => {
    senderRef.current = fn
    setSenderCount((n) => n + 1)
    return () => {
      if (senderRef.current === fn) senderRef.current = null
      setSenderCount((n) => Math.max(0, n - 1))
    }
  }, [])

  // Post a message into the live's chat. When the chat UI is mounted it owns an
  // optimistic sender (registered below), so we use it. But the mini-panels can
  // share while the chat panel is CLOSED — and then no sender is registered, so
  // the old code returned false and callers fell back to the native OS share
  // sheet (the reported bug: sharing a verse tried to leave the app). We now
  // fall back to sending straight to the server for the current room, so a
  // shared verse always lands in the chat whether or not it's open. `roomName`
  // is read from a ref so this callback stays stable across descriptor changes.
  const roomNameRef = useRef<string | null>(descriptor.roomName)
  roomNameRef.current = descriptor.roomName
  const shareToChat = useCallback(async (text: string, meta: LiveChatMessageMeta | null = null) => {
    if (senderRef.current) {
      await senderRef.current(text, meta)
      return true
    }
    const roomName = roomNameRef.current
    if (!roomName) return false
    try {
      await sendLiveChat({ roomName, body: text, kind: meta?.kind === "bible" ? "bible" : "message", meta })
      return true
    } catch {
      return false
    }
  }, [])

  const videoAudioSinkRef = useRef<VideoAudioSink | null>(null)
  const registerVideoAudioSink = useCallback((sink: VideoAudioSink) => {
    videoAudioSinkRef.current = sink
    return () => {
      if (videoAudioSinkRef.current === sink) videoAudioSinkRef.current = null
    }
  }, [])
  const publishVideoAudio = useCallback(async (track: MediaStreamTrack) => {
    await videoAudioSinkRef.current?.publish(track)
  }, [])
  const unpublishVideoAudio = useCallback(async () => {
    await videoAudioSinkRef.current?.unpublish()
  }, [])
  const publishVideoPixels = useCallback(async (track: MediaStreamTrack) => {
    await videoAudioSinkRef.current?.publishVideo(track)
  }, [])
  const unpublishVideoPixels = useCallback(async () => {
    await videoAudioSinkRef.current?.unpublishVideo()
  }, [])

  const value = useMemo<ResourceCtx>(
    () => ({
      descriptor,
      activePanel,
      payload,
      drawerOpen,
      openDrawer,
      closeDrawer,
      openPanel,
      closePanel,
      registerChatSender,
      shareToChat,
      // True whenever we can deliver to chat: either a mounted chat sender, or a
      // room to send directly to when the chat panel is closed.
      canShareToChat: senderCount > 0 || !!descriptor.roomName,
      registerVideoAudioSink,
      publishVideoAudio,
      unpublishVideoAudio,
      publishVideoPixels,
      unpublishVideoPixels,
      videoLocked,
      setVideoLocked,
    }),
    [
      descriptor,
      activePanel,
      payload,
      drawerOpen,
      openDrawer,
      closeDrawer,
      openPanel,
      closePanel,
      registerChatSender,
      shareToChat,
      senderCount,
      registerVideoAudioSink,
      publishVideoAudio,
      unpublishVideoAudio,
      publishVideoPixels,
      unpublishVideoPixels,
      videoLocked,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
