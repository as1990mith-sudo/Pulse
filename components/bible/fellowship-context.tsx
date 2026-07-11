"use client"

import { createContext, useContext } from "react"
import type { BibleIndicator } from "@/app/actions/bible-community"

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

export type FellowshipContextValue = {
  // Live header indicator (null while loading or signed out).
  indicator: BibleIndicator | null
  book: string

  // Readers discovery sheet.
  readersOpen: boolean
  openReaders: () => void
  closeReaders: () => void

  // Profile overlay (by user id, null = closed).
  profileUserId: string | null
  openProfile: (userId: string) => void
  closeProfile: () => void

  // Floating chat.
  activeChat: ActiveChat | null
  chatMinimized: boolean
  openingChatFor: string | null
  openChat: (reader: { userId: string; name: string; image: string | null }) => void
  closeChat: () => void
  minimizeChat: () => void
  restoreChat: () => void

  // Verse sharing into the open chat.
  hasOpenChat: boolean
  sharedVerse: SharedVerse | null
  shareVerse: (verse: { reference: string; text: string }) => void
  consumeSharedVerse: () => void
}

export const FellowshipContext = createContext<FellowshipContextValue | null>(null)

export function useBibleFellowship(): FellowshipContextValue {
  const ctx = useContext(FellowshipContext)
  if (!ctx) throw new Error("useBibleFellowship must be used within a BibleFellowshipProvider")
  return ctx
}
