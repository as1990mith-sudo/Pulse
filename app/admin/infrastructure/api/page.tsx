import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "API Health · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"API Health"} description={"Endpoint availability, latency, and error-rate monitoring."} />
}
