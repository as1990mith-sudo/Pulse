import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Platform Overview · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Platform Overview"} description={"A consolidated view of platform metrics and trends across every module."} />
}
