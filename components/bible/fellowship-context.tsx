"use client"

import { createContext, useContext } from "react"
import type { BibleIndicator, BibleReaderMessagePing } from "@/app/actions/bible-community"

// A conversation currently floating over the Bible page. conversationId ties it
// to the real DM thread in the Messages inbox, so closing the floater never
// loses history.
export type ActiveChat = {
  conversationId: number
  userId: string
  name: string
  image: string | null
}

// A verse queued to be shared into the open floating chat.
export type SharedVerse = { reference: string; text: string; token: number }

// Reading privacy. "public" = visible to fellow readers and reachable via the
// in-Bible chat. "private" = invisible (no presence row) and do-not-disturb
// (no incoming reader chats/alerts) for distraction-free reading.
export type BibleVisibility = "public" | "private"

export type FellowshipContextValue = {
  // Live header indicator (null while loading or signed out).
  indicator: BibleIndicator | null
  book: string

  // Reading privacy preference (persisted per device).
  visibility: BibleVisibility
  setVisibility: (v: BibleVisibility) => void

  // Readers discovery sheet.
  readersOpen: boolean
  openReaders: () => void
  closeReaders: () => void

  // Profile overlay (by user id, null = closed).
  profileUserId: string | null
  openProfile: (userId: string) => void
  closeProfile: () => void

  // Floating chats — up to MAX_BIBLE_CHATS bubbles can be open at once, each a
  // fellow reader who's messaging (or being messaged by) the current reader.
  openChats: ActiveChat[]
  // The conversation currently expanded into a full window (null = all are
  // collapsed to bubbles). Only one chat is expanded at a time on mobile.
  expandedChatId: number | null
  openingChatFor: string | null
  // True when the dock is full and `reader` is not already one of the open
  // chats — the UI uses this to explain why a new chat can't be started.
  atChatCapacity: boolean
  openChat: (reader: { userId: string; name: string; image: string | null }) => void
  closeChat: (conversationId: number) => void
  expandChat: (conversationId: number) => void
  minimizeChat: () => void

  // Verse sharing into the open chat.
  hasOpenChat: boolean
  sharedVerse: SharedVerse | null
  shareVerse: (verse: { reference: string; text: string }) => void
  consumeSharedVerse: () => void

  // Incoming message alert from a fellow reader (null = nothing to show).
  messagePing: BibleReaderMessagePing | null
  dismissMessagePing: () => void
}

export const FellowshipContext = createContext<FellowshipContextValue | null>(null)

export function useBibleFellowship(): FellowshipContextValue {
  const ctx = useContext(FellowshipContext)
  if (!ctx) throw new Error("useBibleFellowship must be used within a BibleFellowshipProvider")
  return ctx
}

/**
 * Non-throwing variant for components that may render outside the provider
 * (e.g. the inline indicator, which is part of the reader tree and still mounts
 * for signed-out users where no fellowship provider exists). Returns null when
 * there is no fellowship context.
 */
export function useBibleFellowshipOptional(): FellowshipContextValue | null {
  return useContext(FellowshipContext)
}
