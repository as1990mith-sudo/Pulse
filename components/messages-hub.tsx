"use client"

import { CalendarClock, MessageCircle, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUrlState } from "@/lib/navigation/use-url-state"
import { useRestoredScroll } from "@/lib/navigation/use-restored-scroll"
import { useHideOnScrollDown } from "@/lib/chat-chrome"
import { DmInbox } from "@/components/dm-inbox"
import { ChatroomBrowser } from "@/components/chatroom-browser"
import { AppointmentsHub } from "@/components/appointments/appointments-hub"
import type { DmConversationSummary } from "@/app/actions/dm"
import type { CurrentUser } from "@/lib/session"
import type { ChatroomSummary, ChatroomSearchResult } from "@/app/actions/chatroom"
import type { AppointmentTypeRow, MyAppointmentRow } from "@/app/actions/home-appointments"

const TAB_KEYS = ["chats", "rooms", "schedule"] as const
type Tab = (typeof TAB_KEYS)[number]

const TABS: { value: Tab; label: string; icon: typeof MessageCircle }[] = [
  { value: "chats", label: "Chats", icon: MessageCircle },
  { value: "rooms", label: "Rooms", icon: Users },
  { value: "schedule", label: "Schedule", icon: CalendarClock },
]

/**
 * Premium Messages hub with three top-level surfaces:
 *  - Chats: strictly 1:1 private conversations (DmInbox).
 *  - Rooms: the exact standalone Chatrooms browser, reused as-is, minus the
 *    featured community cards (user-created rooms only).
 *  - Schedule: the appointment timeline (AppointmentsHub), context-aware — the
 *    member booking flow, or an admin's hosted-sessions console. This is where
 *    appointment schedules live now, instead of appointment-kind threads mixed
 *    into Chats.
 *
 * The tab bar uses the same language as the profile tabs: full-width columns on
 * a top border, uppercase labels revealed only on the active tab, and a sliding
 * top indicator. It pins beneath the global header and slides away on
 * scroll-down in lockstep with the header + bottom nav, then instantly returns
 * on scroll-up — the same immersive behaviour used across the app's chat pages.
 */
export function MessagesHub({
  conversations,
  currentUser,
  rooms,
  discoverRooms,
  appointments,
  bookableTypes,
  activeHandle,
  activeHomeName,
  hostMode,
  publishableKey,
}: {
  conversations: DmConversationSummary[]
  currentUser: CurrentUser
  rooms: ChatroomSummary[]
  discoverRooms: ChatroomSearchResult[]
  appointments: MyAppointmentRow[]
  bookableTypes: AppointmentTypeRow[]
  activeHandle: string | null
  activeHomeName: string | null
  hostMode: boolean
  publishableKey: string
}) {
  // Kept in the URL so the selection survives navigation: opening a room routes
  // to /chatrooms/[id], and Back restores /messages?tab=rooms, reopening the Rooms
  // list instead of resetting to Chats.
  const [tab, selectTab] = useUrlState<Tab>("tab", "chats", { valid: TAB_KEYS })
  // Come back from a conversation to the same place in the list. Scoped per tab so
  // each surface keeps an independent scroll position rather than sharing one.
  useRestoredScroll(`messages:${tab}`)
  const chromeHidden = useHideOnScrollDown()

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.value === tab))

  return (
    <div>
      {/* Sticky, hide-on-scroll tab bar in the profile-tab visual language:
          full-width columns on a top border, icon-only until active, with a
          sliding foreground indicator. */}
      <div
        className={cn(
          "sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 border-b border-border/60 bg-background/90 backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out",
          chromeHidden ? "-translate-y-[calc(100%+4.5rem)] opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <div
          role="tablist"
          aria-label="Messages sections"
          className="relative mx-auto grid w-full max-w-md grid-cols-3 border-t border-border/60"
        >
          {TABS.map(({ value, label, icon: Icon }) => {
            const active = tab === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                title={label}
                onClick={() => selectTab(value)}
                className={cn(
                  "flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {/* Only the active tab reveals its label; the rest stay icon-only. */}
                <span className={cn("whitespace-nowrap", !active && "sr-only")}>{label}</span>
              </button>
            )
          })}
          {/* Sliding active indicator */}
          <span
            className="absolute -top-px left-0 h-0.5 w-1/3 bg-foreground transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
            aria-hidden
          />
        </div>
      </div>

      {/* `key={tab}` remounts the panel on every switch so the shared
          `fade-slide-in` entrance re-fires — each surface (and the first paint)
          glides up and settles rather than hard-cutting in. The utility is
          compositor-only (opacity + transform) and disabled under
          prefers-reduced-motion. */}
      <div key={tab} className="fade-slide-in">
        {tab === "chats" ? (
          <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 [&>*]:scroll-mt-40 sm:px-6">
            <DmInbox conversations={conversations} currentUser={currentUser} />
          </div>
        ) : tab === "rooms" ? (
          <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 [&>*]:scroll-mt-40 sm:px-6">
            {/* Reuse the exact Chatrooms browser: keep its My rooms / Discover /
                Create switcher and every interaction, but hide the featured
                community cards and let this hub own the outer sticky bar. */}
            <ChatroomBrowser rooms={rooms} discoverRooms={discoverRooms} showFeatured={false} stickyTabs={false} />
          </div>
        ) : (
          // Schedule: the appointment timeline, reused as-is (its own container),
          // with the hero/description dropped since the tab already labels it.
          <AppointmentsHub
            appointments={appointments}
            bookableTypes={bookableTypes}
            activeHandle={activeHandle}
            activeHomeName={activeHomeName}
            hostMode={hostMode}
            publishableKey={publishableKey}
            hideHeader
          />
        )}
      </div>
    </div>
  )
}
