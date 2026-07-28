"use client"

import { useState } from "react"
import { HelpCircle, Flame } from "lucide-react"
import { CommunityHelp } from "@/components/community-help"
import { ITestify } from "@/components/itestify"
import { useChatChromeHidden, setChatChromeHidden } from "@/lib/chat-chrome"
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
  const chromeHidden = useChatChromeHidden()

  function switchTab(next: Tab) {
    if (next === tab) return
    // Reveal chrome so the newly mounted feed starts at a clean, visible header
    // instead of inheriting a stale "hidden" state from the previous scroll.
    setChatChromeHidden(false)
    setTab(next)
  }

  const tabs: { value: Tab; label: string; icon: typeof HelpCircle }[] = [
    { value: "community", label: "Community Help", icon: HelpCircle },
    { value: "itestify", label: "iTestify", icon: Flame },
  ]

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* Top-level segmented control. Collapses (max-height + opacity, kept in
          flow) on scroll-down so the feed reclaims the space smoothly. */}
      <div
        className={cn(
          "shrink-0 overflow-hidden border-b border-border/60 bg-background/95 px-4 pb-2.5 pt-3 backdrop-blur transition-[max-height,opacity,padding] duration-300 ease-out sm:px-6",
          chromeHidden ? "pointer-events-none max-h-0 border-transparent py-0 opacity-0" : "max-h-24 opacity-100",
        )}
      >
        <div
          role="tablist"
          aria-label="Chat Rooms sections"
          className="mx-auto grid h-14 w-full max-w-md grid-cols-2 gap-1 rounded-full border border-primary/15 bg-gradient-to-b from-card/80 to-card/40 p-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        >
          {tabs.map(({ value, label, icon: Icon }) => {
            const active = tab === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(value)}
                className={cn(
                  "group relative flex h-full items-center justify-center gap-1.5 rounded-full text-[13px] font-medium tracking-wide transition-all duration-300",
                  active
                    ? "bg-gradient-to-b from-primary to-primary/85 font-semibold text-primary-foreground shadow-[0_2px_10px_-2px_color-mix(in_oklab,var(--primary)_60%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.25)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4 transition-transform duration-300", active && "scale-110")} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active experience fills the rest and owns its own scroll + header. */}
      <div className="relative flex-1 overflow-hidden">
        {tab === "community" ? (
          <CommunityHelp embedded initialPosts={communityPosts} />
        ) : (
          <ITestify embedded initialPosts={itestifyPosts} currentUser={currentUser} />
        )}
      </div>
    </div>
  )
}
