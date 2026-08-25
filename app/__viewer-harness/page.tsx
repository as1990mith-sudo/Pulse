"use client"

// TEMPORARY verification harness for the immersive image viewer. Deleted after
// the caption + tap-to-fade behaviour is confirmed in the browser.

import { ImmersiveImageViewer } from "@/components/immersive-image-viewer"
import type { FeedPostView } from "@/app/actions/feed"

const LONG = `ANNOUNCEMENTS

Dearly Esteemed Family,
We would like to bring to everyone's attention that this Wednesday, 26th of August, there is going to be a tourist visit to Green Park. Kindly take note. Contact Lina for more details and further instructions about timing.`

const post = {
  id: 1,
  authorId: "u1",
  user: "Tuesday Afternoon Prayer",
  handle: "@tuesday-afternoon-prayer",
  initials: "TA",
  color: "bg-orange-500",
  authorImage: null,
  orgVerified: false,
  orgHandle: null,
  postedAt: "2h",
  createdAtMs: Date.now(),
  text: LONG,
  image: "/placeholder.svg",
  video: null,
  media: [],
  likes: 3,
  liked: false,
  reposts: 0,
  reposted: false,
  saved: false,
  saves: 0,
  shares: 0,
  edited: false,
  isFollowing: false,
  isSelf: false,
  mentionedMe: false,
  comments: [],
} as unknown as FeedPostView

export default function Harness() {
  return (
    <ImmersiveImageViewer
      post={post}
      images={["/placeholder.svg"]}
      currentUser={null}
      onClose={() => {}}
    />
  )
}
