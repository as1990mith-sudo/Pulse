import { redirect } from "next/navigation"

// Reels moved from a standalone destination into the Feed as its own tab
// (For you / Following / Reels). Keep this route working for old links and
// bookmarks by redirecting to the feed with the reels tab pre-selected.
export default function ReelsPage() {
  redirect("/feed?tab=reels")
}
