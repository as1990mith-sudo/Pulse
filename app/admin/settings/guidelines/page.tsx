import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Community Guidelines · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Community Guidelines"} description={"Author and publish the community standards members agree to."} />
}
