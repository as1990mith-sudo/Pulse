import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Engagement · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Engagement"} description={"Understand how members interact with devotionals, articles, books, and live."} />
}
