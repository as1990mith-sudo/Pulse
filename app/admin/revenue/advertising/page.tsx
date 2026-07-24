import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Advertising · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Advertising"} description={"Sponsorships and promoted placements across Frequency surfaces."} />
}
