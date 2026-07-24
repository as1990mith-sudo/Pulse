import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Bans · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Bans"} description={"Permanent account removals, appeals context, and restoration controls."} />
}
