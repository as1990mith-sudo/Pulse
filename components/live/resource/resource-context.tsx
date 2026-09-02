"use client"

// The shared state for the Live Resource system. One provider is mounted per
// live session (inside LiveSessionProvider), so every mini-panel and the drawer
// read the same live descriptor and share a single "active panel" — enforcing
// the rule that only ONE mini-panel is open at a time. Rooms register their chat
// sender here so panels (e.g. the mini-Bible) can share a verse into the live's
// own chat without leaving the live.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { CurrentUser } from "@/lib/session"

export type ResourcePanelId = "bible" | "notes" | "pdf" | "books" | "pinned" | "video"

// Optional payload handed to a panel when it opens (e.g. open the PDF panel on a
// specific document, or the Bible panel on a specific verse).
export type PanelPayload =
  | { kind: "pdf"; url: string; title: string; downloadName?: string }
  | { kind: "book"; productId: number; title: string }
  | { kind: "bible"; verseId?: string; book?: string; chapter?: number }
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

type ChatSender = (text: string) => void | Promise<void>

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
  shareToChat: (text: string) => Promise<boolean>
  canShareToChat: boolean
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
  const senderRef = useRef<ChatSender | null>(null)

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const openPanel = useCallback((id: ResourcePanelId, p: PanelPayload = null) => {
    setPayload(p)
    setActivePanel(id)
    setDrawerOpen(false)
  }, [])

  const closePanel = useCallback(() => {
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

  const shareToChat = useCallback(async (text: string) => {
    if (!senderRef.current) return false
    await senderRef.current(text)
    return true
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
      canShareToChat: senderCount > 0,
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
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
