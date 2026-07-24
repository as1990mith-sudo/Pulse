import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Removed Content · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Removed Content"} description={"Everything hidden or removed by moderators, with restore and permanent-delete."} />
}
