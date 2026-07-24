import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Logs · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Logs"} description={"Searchable application and system logs — arriving in a future release."} />
}
