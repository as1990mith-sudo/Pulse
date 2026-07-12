"use client"

// Orchestrates the live Bible reading fellowship layer: heartbeat presence,
// polling the header indicator, and owning the shared overlay state (readers
// sheet, profile overlay, floating chat, verse sharing). Renders additively on
// top of the existing Bible reader — it never alters reading state or layout.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { useSession } from "@/lib/auth-client"
import {
  heartbeatBiblePresence,
  getBibleIndicator,
  getBibleReaderMessagePings,
  leaveBiblePresence,
  syncBibleChatSlots,
  type BibleActivity,
  type BibleIndicator,
  type BibleReaderMessagePing,
} from "@/app/actions/bible-community"
import { getOrCreateConversation } from "@/app/actions/dm"
import { haptic } from "@/lib/haptics"
import { MAX_BIBLE_CHATS } from "@/lib/bible-chat-constants"
import type { ReactNode } from "react"
import {
  FellowshipContext,
  type ActiveChat,
  type BibleVisibility,
  type FellowshipContextValue,
  type SharedVerse,
} from "./fellowship-context"
import { BibleReadersSheet } from "./readers-sheet"
import { BibleProfileOverlay } from "./profile-overlay"
import { BibleFloatingChat } from "./floating-chat"
import { BibleMessagePing } from "./message-ping"

const HEARTBEAT_MS = 8000
// Incoming-message alerts poll a little slower than the presence heartbeat.
const PING_POLL_MS = 10000
// Where the reading-privacy preference is remembered (per device), matching the
// app's other reading preferences (skin, highlights) which also use localStorage.
const VISIBILITY_KEY = "frequency-bible-visibility"

function localDay(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function BibleFellowship({
  book,
  chapter,
  activity,
  children,
}: {
  book: string
  chapter: number
  activity: BibleActivity
  children: ReactNode
}) {
  const { data: session } = useSession()
  const signedIn = Boolean(session?.user)

  const [indicator, setIndicator] = useState<BibleIndicator | null>(null)

  // Reading privacy — hydrated from localStorage after mount (default public).
  const [visibility, setVisibilityState] = useState<BibleVisibility>("public")
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VISIBILITY_KEY)
      if (stored === "private" || stored === "public") setVisibilityState(stored)
    } catch {
      /* ignore storage failures */
    }
  }, [])
  const isPublic = visibility === "public"

  // Overlay + chat state.
  const [readersOpen, setReadersOpen] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  // Up to MAX_BIBLE_CHATS chat bubbles open at once. Only one is expanded into a
  // full window at a time (expandedChatId); the rest sit as collapsed bubbles.
  const [openChats, setOpenChats] = useState<ActiveChat[]>([])
  const [expandedChatId, setExpandedChatId] = useState<number | null>(null)
  const [openingChatFor, setOpeningChatFor] = useState<string | null>(null)
  const [sharedVerse, setSharedVerse] = useState<SharedVerse | null>(null)
  const [messagePing, setMessagePing] = useState<BibleReaderMessagePing | null>(null)

  // Keep the latest reading location in a ref so the heartbeat interval always
  // sends current values without needing to restart the timer.
  const locationRef = useRef({ book, chapter, activity })
  useEffect(() => {
    locationRef.current = { book, chapter, activity }
  }, [book, chapter, activity])

  // Refs let the message-alert poll read the latest chat state without
  // restarting the polling loop.
  const openChatsRef = useRef(openChats)
  const expandedChatIdRef = useRef(expandedChatId)
  useEffect(() => {
    openChatsRef.current = openChats
    expandedChatIdRef.current = expandedChatId
  }, [openChats, expandedChatId])
  // Only alert for messages that arrive AFTER the page is open — the baseline
  // captures the newest pre-existing unread so we don't pop old threads on load.
  const pingBaselineRef = useRef<number>(0)
  const pingInitializedRef = useRef(false)

  // Heartbeat loop — pings presence, records the reading day, and refreshes the
  // indicator. Pauses while the tab is hidden to save battery/requests, and
  // fires an immediate beat when the tab becomes visible again.
  useEffect(() => {
    if (!signedIn) return
    // Private mode: broadcast nothing. Remove any existing presence row so the
    // reader instantly vanishes from every other reader's view, and clear the
    // stale indicator so the header switches to the private badge.
    if (!isPublic) {
      void leaveBiblePresence()
      setIndicator(null)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function beat() {
      if (typeof document !== "undefined" && document.hidden) return
      try {
        const { book, chapter, activity } = locationRef.current
        const next = await heartbeatBiblePresence({ book, chapter, activity, day: localDay() })
        if (!cancelled && next) setIndicator(next)
      } catch {
        /* transient — next beat retries */
      }
    }

    void beat()
    timer = setInterval(beat, HEARTBEAT_MS)

    function onVisibility() {
      if (!document.hidden) void beat()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [signedIn, isPublic])

  // When the book changes and we're between heartbeats, refresh the indicator
  // promptly so the header reflects the new book without waiting a full cycle.
  useSWR(
    signedIn && isPublic ? ["bible-indicator", book] : null,
    () => getBibleIndicator({ book }),
    {
      refreshInterval: HEARTBEAT_MS,
      revalidateOnFocus: true,
      onSuccess: (data) => data && setIndicator(data),
    },
  )

  // Poll for unread messages from fellow readers and surface a gentle alert
  // when a NEW one arrives. Fellow-reader-only keeps it relevant and reverent.
  useSWR(
    // Private mode is do-not-disturb: no incoming reader alerts at all.
    signedIn && isPublic ? ["bible-msg-pings"] : null,
    getBibleReaderMessagePings,
    {
      refreshInterval: PING_POLL_MS,
      revalidateOnFocus: true,
      onSuccess: (pings) => {
        if (!pings || pings.length === 0) {
          pingInitializedRef.current = true
          return
        }
        // Persist each unread fellow-reader conversation as its own chat bubble,
        // filling up to the capacity (oldest first for a stable stack). This
        // also restores ongoing chats as bubbles after a reload.
        setOpenChats((prev) => {
          if (prev.length >= MAX_BIBLE_CHATS) return prev
          const have = new Set(prev.map((c) => c.conversationId))
          const additions: ActiveChat[] = []
          for (const p of [...pings].reverse()) {
            if (have.has(p.conversationId)) continue
            if (prev.length + additions.length >= MAX_BIBLE_CHATS) break
            additions.push({ conversationId: p.conversationId, userId: p.userId, name: p.name, image: p.image })
            have.add(p.conversationId)
          }
          return additions.length ? [...prev, ...additions] : prev
        })

        const newestMs = pings[0].createdAtMs
        // First result just sets the baseline — no toast for existing unread.
        if (!pingInitializedRef.current) {
          pingBaselineRef.current = newestMs
          pingInitializedRef.current = true
          return
        }
        const fresh = pings.find((p) => p.createdAtMs > pingBaselineRef.current)
        if (!fresh) return
        pingBaselineRef.current = Math.max(pingBaselineRef.current, newestMs)
        // No toast if the reader already has this chat expanded (they see it),
        // or if the dock is full and this sender has no bubble slot.
        if (expandedChatIdRef.current === fresh.conversationId) return
        const openNow = openChatsRef.current
        const hasSlot = openNow.some((c) => c.conversationId === fresh.conversationId)
        if (!hasSlot && openNow.length >= MAX_BIBLE_CHATS) return
        setMessagePing(fresh)
        haptic("light")
      },
    },
  )

  // Heartbeat the set of open chat bubbles as server-side "slots", so other
  // readers' sends can be checked against this reader's concurrent-chat
  // capacity. Runs immediately on any change and on an interval to stay fresh.
  // Private mode tracks nothing (the reader is unreachable anyway).
  useEffect(() => {
    if (!signedIn) return
    if (!isPublic) {
      void syncBibleChatSlots([])
      return
    }
    const payload = () =>
      openChatsRef.current.map((c) => ({ conversationId: c.conversationId, partnerId: c.userId }))
    void syncBibleChatSlots(openChats.map((c) => ({ conversationId: c.conversationId, partnerId: c.userId })))
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      void syncBibleChatSlots(payload())
    }, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [signedIn, isPublic, openChats])

  // Leave presence when the reader unmounts or the tab is closed.
  useEffect(() => {
    if (!signedIn) return
    const onPageHide = () => {
      void leaveBiblePresence()
      void syncBibleChatSlots([])
    }
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("pagehide", onPageHide)
      void leaveBiblePresence()
      void syncBibleChatSlots([])
    }
  }, [signedIn])

  const openReaders = useCallback(() => {
    haptic("light")
    setReadersOpen(true)
  }, [])
  const closeReaders = useCallback(() => setReadersOpen(false), [])

  const openProfile = useCallback((userId: string) => {
    haptic("light")
    setProfileUserId(userId)
  }, [])
  const closeProfile = useCallback(() => setProfileUserId(null), [])

  const openChat = useCallback(
    async (reader: { userId: string; name: string; image: string | null }) => {
      // Already open → just expand it.
      const existing = openChatsRef.current.find((c) => c.userId === reader.userId)
      if (existing) {
        haptic("light")
        setExpandedChatId(existing.conversationId)
        setReadersOpen(false)
        setProfileUserId(null)
        return
      }
      // Dock full → can't start another (the UI explains why via atChatCapacity).
      if (openChatsRef.current.length >= MAX_BIBLE_CHATS) {
        haptic("error")
        return
      }
      setOpeningChatFor(reader.userId)
      haptic("light")
      try {
        const conversationId = await getOrCreateConversation(reader.userId)
        const chat: ActiveChat = {
          conversationId,
          userId: reader.userId,
          name: reader.name,
          image: reader.image,
        }
        setOpenChats((prev) => {
          if (prev.some((c) => c.conversationId === conversationId)) return prev
          if (prev.length >= MAX_BIBLE_CHATS) return prev
          return [...prev, chat]
        })
        setExpandedChatId(conversationId)
        // Getting into a conversation is a good moment to dismiss discovery UI.
        setReadersOpen(false)
        setProfileUserId(null)
      } catch {
        /* ignore — user can retry */
      } finally {
        setOpeningChatFor(null)
      }
    },
    [],
  )
  const closeChat = useCallback((conversationId: number) => {
    // Closing removes the bubble (freeing a slot); the thread lives on in
    // Messages, so nothing is lost.
    setOpenChats((prev) => prev.filter((c) => c.conversationId !== conversationId))
    setExpandedChatId((cur) => (cur === conversationId ? null : cur))
  }, [])
  const expandChat = useCallback((conversationId: number) => {
    haptic("light")
    setExpandedChatId(conversationId)
  }, [])
  const minimizeChat = useCallback(() => {
    haptic("light")
    setExpandedChatId(null)
  }, [])

  const shareVerse = useCallback((verse: { reference: string; text: string }) => {
    haptic("light")
    setSharedVerse({ ...verse, token: Date.now() })
  }, [])
  const consumeSharedVerse = useCallback(() => setSharedVerse(null), [])

  const dismissMessagePing = useCallback(() => setMessagePing(null), [])

  const setVisibility = useCallback((next: BibleVisibility) => {
    haptic("light")
    setVisibilityState(next)
    try {
      localStorage.setItem(VISIBILITY_KEY, next)
    } catch {
      /* ignore storage failures — the choice still applies live */
    }
    if (next === "private") {
      // Going quiet: clear any visible alert immediately.
      setMessagePing(null)
    } else {
      // Returning to public: re-baseline pings so re-enabling doesn't replay
      // messages that arrived while we were private.
      pingInitializedRef.current = false
    }
  }, [])

  const value = useMemo<FellowshipContextValue>(
    () => ({
      indicator,
      book,
      visibility,
      setVisibility,
      readersOpen,
      openReaders,
      closeReaders,
      profileUserId,
      openProfile,
      closeProfile,
      openChats,
      expandedChatId,
      openingChatFor,
      atChatCapacity: openChats.length >= MAX_BIBLE_CHATS,
      openChat,
      closeChat,
      expandChat,
      minimizeChat,
      hasOpenChat: expandedChatId !== null,
      sharedVerse,
      shareVerse,
      consumeSharedVerse,
      messagePing,
      dismissMessagePing,
    }),
    [
      indicator,
      book,
      visibility,
      setVisibility,
      readersOpen,
      openReaders,
      closeReaders,
      profileUserId,
      openProfile,
      closeProfile,
      openChats,
      expandedChatId,
      openingChatFor,
      openChat,
      closeChat,
      expandChat,
      minimizeChat,
      sharedVerse,
      shareVerse,
      consumeSharedVerse,
      messagePing,
      dismissMessagePing,
    ],
  )

  // Signed-out readers get the plain Bible with no fellowship layer — but the
  // children (the reader itself) must always render.
  if (!signedIn) return <>{children}</>

  return (
    <FellowshipContext.Provider value={value}>
      {children}
      {/* Overlays portal to <body>, so their position here doesn't matter. */}
      <BibleReadersSheet />
      <BibleProfileOverlay />
      <BibleFloatingChat />
      <BibleMessagePing />
    </FellowshipContext.Provider>
  )
}
