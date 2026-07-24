import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Suspensions · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Suspensions"} description={"Temporary account restrictions with full history and one-click reversal."} />
}
