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
  leaveBiblePresence,
  type BibleActivity,
  type BibleIndicator,
} from "@/app/actions/bible-community"
import { getOrCreateConversation } from "@/app/actions/dm"
import { haptic } from "@/lib/haptics"
import type { ReactNode } from "react"
import {
  FellowshipContext,
  type ActiveChat,
  type FellowshipContextValue,
  type SharedVerse,
} from "./fellowship-context"
import { BibleReadersSheet } from "./readers-sheet"
import { BibleProfileOverlay } from "./profile-overlay"
import { BibleFloatingChat } from "./floating-chat"

const HEARTBEAT_MS = 8000

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

  // Overlay + chat state.
  const [readersOpen, setReadersOpen] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null)
  const [chatMinimized, setChatMinimized] = useState(false)
  const [openingChatFor, setOpeningChatFor] = useState<string | null>(null)
  const [sharedVerse, setSharedVerse] = useState<SharedVerse | null>(null)

  // Keep the latest reading location in a ref so the heartbeat interval always
  // sends current values without needing to restart the timer.
  const locationRef = useRef({ book, chapter, activity })
  useEffect(() => {
    locationRef.current = { book, chapter, activity }
  }, [book, chapter, activity])

  // Heartbeat loop — pings presence, records the reading day, and refreshes the
  // indicator. Pauses while the tab is hidden to save battery/requests, and
  // fires an immediate beat when the tab becomes visible again.
  useEffect(() => {
    if (!signedIn) return
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
  }, [signedIn])

  // When the book changes and we're between heartbeats, refresh the indicator
  // promptly so the header reflects the new book without waiting a full cycle.
  useSWR(
    signedIn ? ["bible-indicator", book] : null,
    () => getBibleIndicator({ book }),
    {
      refreshInterval: HEARTBEAT_MS,
      revalidateOnFocus: true,
      onSuccess: (data) => data && setIndicator(data),
    },
  )

  // Leave presence when the reader unmounts or the tab is closed.
  useEffect(() => {
    if (!signedIn) return
    const onPageHide = () => {
      void leaveBiblePresence()
    }
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("pagehide", onPageHide)
      void leaveBiblePresence()
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
      setOpeningChatFor(reader.userId)
      haptic("light")
      try {
        const conversationId = await getOrCreateConversation(reader.userId)
        setActiveChat({ conversationId, userId: reader.userId, name: reader.name, image: reader.image })
        setChatMinimized(false)
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
  const closeChat = useCallback(() => {
    // Closing only removes the floater; the thread lives on in Messages.
    setActiveChat(null)
    setChatMinimized(false)
  }, [])
  const minimizeChat = useCallback(() => {
    haptic("light")
    setChatMinimized(true)
  }, [])
  const restoreChat = useCallback(() => setChatMinimized(false), [])

  const shareVerse = useCallback((verse: { reference: string; text: string }) => {
    haptic("light")
    setSharedVerse({ ...verse, token: Date.now() })
  }, [])
  const consumeSharedVerse = useCallback(() => setSharedVerse(null), [])

  const value = useMemo<FellowshipContextValue>(
    () => ({
      indicator,
      book,
      readersOpen,
      openReaders,
      closeReaders,
      profileUserId,
      openProfile,
      closeProfile,
      activeChat,
      chatMinimized,
      openingChatFor,
      openChat,
      closeChat,
      minimizeChat,
      restoreChat,
      hasOpenChat: Boolean(activeChat),
      sharedVerse,
      shareVerse,
      consumeSharedVerse,
    }),
    [
      indicator,
      book,
      readersOpen,
      openReaders,
      closeReaders,
      profileUserId,
      openProfile,
      closeProfile,
      activeChat,
      chatMinimized,
      openingChatFor,
      openChat,
      closeChat,
      minimizeChat,
      restoreChat,
      sharedVerse,
      shareVerse,
      consumeSharedVerse,
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
    </FellowshipContext.Provider>
  )
}
