import { ChatroomsSkeleton } from "@/components/loading-skeletons"
import { DelayedSkeleton } from "@/components/delayed-skeleton"

export default function Loading() {
  // Only reveal the skeleton if the chatrooms list genuinely stalls; a fast
  // (prefetched) navigation resolves first, so the tab switch feels instant.
  return (
    <DelayedSkeleton>
      <ChatroomsSkeleton />
    </DelayedSkeleton>
  )
}
