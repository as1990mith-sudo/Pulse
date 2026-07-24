import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Retention · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Retention"} description={"Cohort retention and lifecycle insight to grow a durable community."} />
}
