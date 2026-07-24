import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Appeals · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Appeals"} description={"Members can contest moderation decisions; reviewers resolve them here."} />
}
