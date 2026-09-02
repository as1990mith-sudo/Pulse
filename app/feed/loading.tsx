import { FeedSkeleton } from "@/components/loading-skeletons"
import { DelayedSkeleton } from "@/components/delayed-skeleton"

export default function Loading() {
  // Only reveal the skeleton if the feed genuinely stalls; a fast (prefetched)
  // navigation resolves first, so the tab switch feels instant.
  return (
    <DelayedSkeleton>
      <FeedSkeleton />
    </DelayedSkeleton>
  )
}
