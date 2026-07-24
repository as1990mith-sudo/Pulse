import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Cache · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Cache"} description={"Cache hit-rate and invalidation controls — arriving in a future release."} />
}
