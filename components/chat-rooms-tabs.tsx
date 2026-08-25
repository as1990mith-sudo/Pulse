"use client"

import { useState } from "react"
import { Flame, Info, MessagesSquare } from "lucide-react"
import { CommunityHelp, CommunityHelpInfoModal } from "@/components/community-help"
import { ITestify } from "@/components/itestify"
import { setChatChromeHidden } from "@/lib/chat-chrome"
import { cn } from "@/lib/utils"

type Tab = "community" | "itestify"

// Declared once so the tab bar and its sliding indicator derive from a single
// ordered source rather than duplicating the order in markup.
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "community", label: "Community", icon: <MessagesSquare className="size-4" /> },
  { key: "itestify", label: "iTestify", icon: <Flame className="size-4" /> },
]

/**
 * Chat Rooms content hub. Replaces the old room-directory landing (big
 * Community Help / QOTD / iTestify "Open" cards + My rooms/Discover/Create) with
 * a simple two-tab content switcher. Community Help is open by default — there
 * is no intermediate screen and nothing to "open".
 *
 * Each tab renders the existing full-height experience as-is (its own header,
 * feed, composer and floating action button). The top-level switcher collapses
 * on scroll-down and returns on scroll-up in lockstep with the child feeds'
 * own headers (shared `chat-chrome` store) for an immersive, distraction-free read.
 */
export function ChatRoomsTabs({
  communityPosts,
  itestifyPosts,
  currentUser,
  postAsOrg = null,
}: {
  communityPosts: React.ComponentProps<typeof CommunityHelp>["initialPosts"]
  itestifyPosts: React.ComponentProps<typeof ITestify>["initialPosts"]
  currentUser: React.ComponentProps<typeof ITestify>["currentUser"]
  postAsOrg?: React.ComponentProps<typeof CommunityHelp>["postAsOrg"]
}) {
  const [tab, setTab] = useState<Tab>("community")
  // The Community Help info (ⓘ) sheet — its content moved here from the old
  // standalone Community Help header, which no longer renders inside the hub.
  const [infoOpen, setInfoOpen] = useState(false)

  function switchTab(next: Tab) {
    if (next === tab) return
    // Reveal chrome so the newly mounted feed starts at a clean, visible header
    // instead of inheriting a stale "hidden" state from the previous scroll.
    setChatChromeHidden(false)
    setTab(next)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top-level tab bar — same language as the profile tabs: full-width
          columns, uppercase labels revealed only on the active tab, and a
          sliding top indicator. Stays static; only the app header hides on
          scroll. The Community info (ⓘ) button is reached from the feed header
          instead of living inside a tab, which keeps each column a single
          control and the two tabs visually symmetrical. */}
      <div className="shrink-0 overflow-hidden border-b border-border/60 bg-background/95 backdrop-blur">
        <div
          role="tablist"
          aria-label="Chat Rooms sections"
          className="relative mx-auto grid w-full max-w-md grid-cols-2 border-t border-border/60"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              title={t.label}
              onClick={() => switchTab(t.key)}
              className={cn(
                "flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors",
                tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon}
              {/* Only the active tab shows its label; the rest stay icon-only. */}
              <span className={cn("whitespace-nowrap", tab !== t.key && "sr-only")}>{t.label}</span>
            </button>
          ))}
          {/* Sliding active indicator */}
          <span
            className="absolute -top-px left-0 h-0.5 w-1/2 bg-foreground transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${TABS.findIndex((t) => t.key === tab) * 100}%)` }}
            aria-hidden
          />
          {/* "How Community works" — absolutely positioned so the two tab
              columns stay exactly equal, and only offered on that tab. */}
          {tab === "community" && (
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="How Community works"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Active experience fills the rest and owns its own scroll. */}
      <div className="relative flex-1 overflow-hidden">
        {tab === "community" ? (
          <CommunityHelp embedded initialPosts={communityPosts} postAsOrg={postAsOrg} />
        ) : (
          <ITestify embedded initialPosts={itestifyPosts} currentUser={currentUser} />
        )}
      </div>

      <CommunityHelpInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  )
}
