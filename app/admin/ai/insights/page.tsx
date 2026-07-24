import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "AI Insights · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"AI Insights"} description={"AI-generated insight across community health and content trends."} />
}
