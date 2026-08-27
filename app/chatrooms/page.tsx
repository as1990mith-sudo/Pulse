import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { ChatRoomsTabs } from "@/components/chat-rooms-tabs"
import { getCommunityPosts, getPublishableOrg } from "@/app/actions/community"
import { getChannelFeed } from "@/app/actions/feed"
import { getCurrentUser } from "@/lib/session"
import { getActiveHomeContext } from "@/lib/home/active-home"
import { REVIEW_TAB_OPTIONS } from "@/lib/home/types"

export const metadata = {
  title: "Chat Rooms — Frequency",
  description: "Ask anonymously in Community or share what God has done in iTestify.",
}

export default async function ChatroomsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  // Both rooms are scoped to the Home the reader is currently in, so Kingdom
  // Academy and Prayer Palace each get their own private Community and iTestify.
  // This mount previously called both feeds with no Home at all, which resolved
  // to the Universal (global) scope — every Home rendered one shared room, so
  // threads appeared to leak between organisations.
  //
  // `home` is null only when the reader is in no Home (the personal/global
  // context); passing null through keeps that case on the Universal room rather
  // than inventing a Home for them.
  const { home } = await getActiveHomeContext()

  // Both tab feeds are fetched up front so switching between Community Help and
  // iTestify is instant (no intermediate screen, nothing to "open").
  // postAsOrg is non-null only for org owners/admins, letting them publish a
  // Community Help thread in the organisation's voice.
  const [communityPosts, itestifyPosts, postAsOrg] = await Promise.all([
    getCommunityPosts(home?.id ?? null),
    getChannelFeed("itestify", { homeId: home?.id ?? null }),
    getPublishableOrg(),
  ])

  return (
    // Full-viewport immersive shell: the main Frequency header stays visible on
    // load and collapses to zero height on scroll-down (reveal on scroll-up),
    // in lockstep with the tab bar and bottom nav — all driven by the shared
    // chat-chrome store the feeds update as they scroll.
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <SiteHeader collapsible />
      <div className="min-h-0 flex-1">
        <ChatRoomsTabs
          communityPosts={communityPosts}
          itestifyPosts={itestifyPosts}
          currentUser={currentUser}
          postAsOrg={postAsOrg}
          homeId={home?.id ?? null}
          reviewTabLabel={home?.reviewTabLabel ?? REVIEW_TAB_OPTIONS[0]}
        />
      </div>
    </div>
  )
}
