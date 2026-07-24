import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Analytics · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Analytics"} description={"Premium dashboards for growth, engagement, retention, and content performance."} />
}
