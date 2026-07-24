import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Integrations · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Integrations"} description={"Connect Frequency to external services and data sources."} />
}
