import { redirect } from "next/navigation"
import { ChatRoomsTabs } from "@/components/chat-rooms-tabs"
import { getCommunityPosts } from "@/app/actions/community"
import { getChannelFeed } from "@/app/actions/feed"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Chat Rooms — Frequency",
  description: "Ask anonymously in Community Help or share what God has done in iTestify.",
}

export default async function ChatroomsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/sign-in")

  // Both tab feeds are fetched up front so switching between Community Help and
  // iTestify is instant (no intermediate screen, nothing to "open").
  const [communityPosts, itestifyPosts] = await Promise.all([getCommunityPosts(), getChannelFeed("itestify")])

  return (
    <ChatRoomsTabs communityPosts={communityPosts} itestifyPosts={itestifyPosts} currentUser={currentUser} />
  )
}
