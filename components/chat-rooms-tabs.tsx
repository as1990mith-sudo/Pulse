"use client"

import { Flame, MessagesSquare } from "lucide-react"
import { CommunityHelp } from "@/components/community-help"
import { ITestify } from "@/components/itestify"
import { setChatChromeHidden } from "@/lib/chat-chrome"
import { useUrlState } from "@/lib/navigation/use-url-state"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["community", "itestify"] as const
type Tab = (typeof TAB_KEYS)[number]

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
  homeId = null,
}: {
  communityPosts: React.ComponentProps<typeof CommunityHelp>["initialPosts"]
  itestifyPosts: React.ComponentProps<typeof ITestify>["initialPosts"]
  currentUser: React.ComponentProps<typeof ITestify>["currentUser"]
  postAsOrg?: React.ComponentProps<typeof CommunityHelp>["postAsOrg"]
  /**
   * The Home both rooms are scoped to, or null for the Universal (global) rooms.
   * Passed down so each room's SWR key and revalidation stay inside the same
   * scope the server rendered — without it, the 20s refresh would swap the
   * Home's threads for the global ones.
   */
  homeId?: string | null
}) {
  // In the URL so a reload — or returning from a thread — keeps the room the user
  // was reading instead of snapping back to Community.
  const [tab, setTab] = useUrlState<Tab>("room", "community", { valid: TAB_KEYS })

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
          scroll. */}
      <div className="shrink-0 overflow-hidden border-b border-border/60 bg-background/95 backdrop-blur">
        {/* The positioning context is this wrapper rather than the tablist, so
            the info button can sit visually inside the bar while staying OUTSIDE
            `role="tablist"` — a tablist must only contain tabs. */}
        <div className="relative mx-auto w-full max-w-md">
          <div
            role="tablist"
            aria-label="Chat Rooms sections"
            className="relative grid w-full grid-cols-2 border-t border-border/60"
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
          </div>
        </div>
      </div>

      {/* Active experience fills the rest and owns its own scroll. */}
      <div className="relative flex-1 overflow-hidden">
        {tab === "community" ? (
          <CommunityHelp embedded initialPosts={communityPosts} postAsOrg={postAsOrg} homeId={homeId} />
        ) : (
          <ITestify embedded initialPosts={itestifyPosts} currentUser={currentUser} homeId={homeId} />
        )}
      </div>
    </div>
  )
}
