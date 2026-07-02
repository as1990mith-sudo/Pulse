import { ReelsFeed } from "@/components/reels-feed"
import { getFeed } from "@/app/actions/feed"

// Reels is now a top-level destination in the footer nav (between Feed and
// Chatroom). It flattens every video across the feed into a full-screen,
// vertically-snapping player. No close button here — the footer handles
// navigating away.
export default async function ReelsPage() {
  const posts = await getFeed()
  return <ReelsFeed posts={posts} />
}
