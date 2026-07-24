import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Queue Monitoring · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Queue Monitoring"} description={"Background job and queue depth monitoring — arriving in a future release."} />
}
