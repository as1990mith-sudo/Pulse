"use client"

import { useState } from "react"
import { Flame, Info } from "lucide-react"
import { CommunityHelp, CommunityHelpInfoModal } from "@/components/community-help"
import { ITestify } from "@/components/itestify"
import { setChatChromeHidden } from "@/lib/chat-chrome"
import { cn } from "@/lib/utils"

type Tab = "community" | "itestify"

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
}: {
  communityPosts: React.ComponentProps<typeof CommunityHelp>["initialPosts"]
  itestifyPosts: React.ComponentProps<typeof ITestify>["initialPosts"]
  currentUser: React.ComponentProps<typeof ITestify>["currentUser"]
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
      {/* Top-level segmented control. Stays static (always visible) — only the
          global app header hides/reveals on scroll. */}
      <div className="shrink-0 overflow-hidden border-b border-border/60 bg-background/95 px-4 pb-2.5 pt-3 backdrop-blur sm:px-6">
        <div
          role="tablist"
          aria-label="Chat Rooms sections"
          className="mx-auto grid h-11 w-full max-w-md grid-cols-2 gap-1 rounded-full border border-border/60 bg-secondary/40 p-1"
        >
          {/* Community Help segment: the tab selector plus an adjacent info (ⓘ)
              button. The info icon is the segment's only icon (it replaces the
              old HelpCircle logo), and the label stays on a single line. Both
              live inside one rounded segment that carries the active gradient
              pill; sibling buttons (not nested) keep it valid and accessible. */}
          <div
            className={cn(
              "flex h-full items-center justify-center rounded-full transition-all duration-300",
              tab === "community"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="How Community Help works"
              className={cn(
                "flex h-full items-center rounded-full pl-4 pr-1.5 transition-opacity",
                tab === "community" ? "opacity-90 hover:opacity-100" : "hover:text-foreground",
              )}
            >
              <Info className={cn("size-4 transition-transform duration-300", tab === "community" && "scale-110")} />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "community"}
              onClick={() => switchTab("community")}
              className={cn(
                "inline-flex h-full items-center whitespace-nowrap rounded-full pr-4 text-[13px] font-medium tracking-wide transition-colors",
                tab === "community" ? "font-semibold" : "hover:text-foreground",
              )}
            >
              Community Help
            </button>
          </div>

          {/* iTestify segment */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "itestify"}
            onClick={() => switchTab("itestify")}
            className={cn(
              "group relative flex h-full items-center justify-center gap-1.5 rounded-full text-[13px] font-medium tracking-wide transition-all duration-300",
              tab === "itestify"
                ? "bg-card font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Flame className={cn("size-4 transition-transform duration-300", tab === "itestify" && "scale-110")} />
            iTestify
          </button>
        </div>
      </div>

      {/* Active experience fills the rest and owns its own scroll. */}
      <div className="relative flex-1 overflow-hidden">
        {tab === "community" ? (
          <CommunityHelp embedded initialPosts={communityPosts} />
        ) : (
          <ITestify embedded initialPosts={itestifyPosts} currentUser={currentUser} />
        )}
      </div>

      <CommunityHelpInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  )
}
