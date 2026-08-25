"use client"

import { MessageCircle, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUrlState } from "@/lib/navigation/use-url-state"
import { useHideOnScrollDown } from "@/lib/chat-chrome"
import { DmInbox } from "@/components/dm-inbox"
import { ChatroomBrowser } from "@/components/chatroom-browser"
import type { DmConversationSummary } from "@/app/actions/dm"
import type { CurrentUser } from "@/lib/session"
import type { ChatroomSummary, ChatroomSearchResult } from "@/app/actions/chatroom"

const TAB_KEYS = ["chats", "rooms"] as const
type Tab = (typeof TAB_KEYS)[number]

const TABS: { value: Tab; label: string; icon: typeof MessageCircle }[] = [
  { value: "chats", label: "Chats", icon: MessageCircle },
  { value: "rooms", label: "Rooms", icon: Users },
]

/**
 * Premium Messages hub with two top-level surfaces:
 *  - Chats: strictly 1:1 private conversations (DmInbox).
 *  - Rooms: the exact standalone Chatrooms browser, reused as-is, minus the
 *    featured community cards (user-created rooms only).
 *
 * The top segmented control pins beneath the global header and slides away on
 * scroll-down in lockstep with the header + bottom nav, then instantly returns
 * on scroll-up — the same immersive behaviour used across the app's chat pages.
 */
export function MessagesHub({
  conversations,
  currentUser,
  rooms,
  discoverRooms,
}: {
  conversations: DmConversationSummary[]
  currentUser: CurrentUser
  rooms: ChatroomSummary[]
  discoverRooms: ChatroomSearchResult[]
}) {
  // Kept in the URL so the selection survives navigation: opening a room routes
  // to /chatrooms/[id], and Back restores /messages?tab=rooms, reopening the Rooms
  // list instead of resetting to Chats.
  //
  // This previously hand-rolled the same logic but called
  // `replaceState(null, ...)`, which WIPED the Next.js router state stored on the
  // history entry. The shared hook preserves it.
  const [tab, selectTab] = useUrlState<Tab>("tab", "chats", { valid: TAB_KEYS })
  const chromeHidden = useHideOnScrollDown()

  return (
    <div>
      {/* Sticky, hide-on-scroll segmented control. The animated gold indicator
          slides between segments via a translated absolute pill. */}
      <div
        className={cn(
          "sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out sm:px-6",
          chromeHidden ? "-translate-y-[calc(100%+4.5rem)] opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <div
          role="tablist"
          aria-label="Messages sections"
          className="relative mx-auto grid h-11 w-full max-w-md grid-cols-2 gap-1 rounded-full border border-primary/15 bg-gradient-to-b from-card/80 to-card/40 p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        >
          {/* Animated indicator pill. Width spans one segment (half the rail
              minus the 0.375rem padding). Because the pill's width equals the
              travel distance, sliding it exactly its own width (translateX 100%)
              lands it perfectly over the second segment. NOTE: calc() operators
              need surrounding whitespace, and Tailwind arbitrary values encode
              those spaces as underscores — omitting them makes the value invalid
              and silently drops it (which previously froze the pill on Chats). */}
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc(50%_-_0.25rem)] rounded-full bg-gradient-to-b from-primary to-primary/85 shadow-[0_2px_10px_-2px_color-mix(in_oklab,var(--primary)_60%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.25)] transition-transform duration-300 ease-out"
            style={{ transform: tab === "rooms" ? "translateX(100%)" : "translateX(0)" }}
          />
          {TABS.map(({ value, label, icon: Icon }) => {
            const active = tab === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(value)}
                className={cn(
                  "group relative z-10 flex h-full items-center justify-center gap-1.5 rounded-full text-[13px] tracking-wide transition-colors duration-300",
                  active ? "font-semibold text-primary-foreground" : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4 transition-transform duration-300", active && "scale-110")} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 [&>*]:scroll-mt-40 sm:px-6">
        {tab === "chats" ? (
          <DmInbox conversations={conversations} currentUser={currentUser} />
        ) : (
          // Reuse the exact Chatrooms browser: keep its My rooms / Discover /
          // Create switcher and every interaction, but hide the featured
          // community cards and let this hub own the outer sticky bar.
          <ChatroomBrowser rooms={rooms} discoverRooms={discoverRooms} showFeatured={false} stickyTabs={false} />
        )}
      </div>
    </div>
  )
}
