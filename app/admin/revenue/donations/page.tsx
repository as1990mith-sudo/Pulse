import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Donations · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Donations"} description={"One-time and recurring giving, campaigns, and donor acknowledgement."} />
}
