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
      {/* Top-level tab bar — editorial underline style matching the Catalogue
          tabs: a bottom border baseline with the active tab carrying a
          `border-primary` underline. Stays static (always visible) — only the
          global app header hides/reveals on scroll. */}
      <div className="shrink-0 overflow-hidden border-b border-border/60 bg-background/95 px-4 pt-1 backdrop-blur sm:px-6">
        <div
          role="tablist"
          aria-label="Chat Rooms sections"
          className="mx-auto flex w-full max-w-md"
        >
          {/* Community Help tab: the tab selector plus an adjacent info (ⓘ)
              button, both sharing one underline. Sibling buttons (not nested)
              keep the markup valid and accessible. */}
          <div
            className={cn(
              "-mb-px flex flex-1 items-center justify-center gap-1 border-b-2 transition-colors",
              tab === "community" ? "border-primary" : "border-transparent",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "community"}
              onClick={() => switchTab("community")}
              className={cn(
                "flex items-center whitespace-nowrap py-3 text-xs font-medium transition-colors",
                tab === "community" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Community Help
            </button>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="How Community Help works"
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" />
            </button>
          </div>

          {/* iTestify tab */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "itestify"}
            onClick={() => switchTab("itestify")}
            className={cn(
              "-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-xs font-medium transition-colors",
              tab === "itestify"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Flame className="size-4" />
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
