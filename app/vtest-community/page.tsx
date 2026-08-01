import { CommunityHelp } from "@/components/community-help"
import type { CommunityPostView } from "@/app/actions/community"

// TEMPORARY visual-verification route. Delete after review.
const now = Date.now()
const posts: CommunityPostView[] = [
  {
    id: 90001,
    body: "I've been struggling to forgive someone who hurt me deeply. I keep reading Matthew 6:14 and Colossians 3:13 but my heart still feels heavy. How did you learn to actually let go and not just say the words?",
    postedAt: "2h ago",
    createdAtMs: now - 7200000,
    edited: false,
    commentCount: 3,
    isSelf: false,
    authorName: null,
    authorHandle: null,
    authorInitials: null,
    authorColor: null,
    authorImage: null,
  },
  {
    id: 90002,
    body: "Feeling really anxious about a big decision this week. Would love prayer and any wisdom you can share. I keep coming back to Philippians 4:6-7 but the worry creeps back in every night. What has helped you find peace when everything feels uncertain and you can't see the next step clearly? Sometimes it feels like the more I try to control it, the heavier it gets, and I just want to trust that things will work out the way they're meant to.",
    postedAt: "5h ago",
    createdAtMs: now - 18000000,
    edited: true,
    commentCount: 12,
    isSelf: true,
    authorName: "Test Reviewer",
    authorHandle: "@reviewer",
    authorInitials: "TR",
    authorColor: "bg-sky-600",
    authorImage: null,
  },
  {
    id: 90003,
    body: "What's one small habit that strengthened your faith this year?",
    postedAt: "1d ago",
    createdAtMs: now - 86400000,
    edited: false,
    commentCount: 0,
    isSelf: false,
    authorName: null,
    authorHandle: null,
    authorInitials: null,
    authorColor: null,
    authorImage: null,
  },
]

export default function VTestCommunityPage() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <CommunityHelp initialPosts={posts} />
      </main>
    </div>
  )
}
