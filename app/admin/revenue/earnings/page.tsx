import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Creator Earnings · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Creator Earnings"} description={"Creator revenue share, statements, and earnings visibility."} />
}
