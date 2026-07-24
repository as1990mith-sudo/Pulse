import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Complaints · Frequency Admin" }

export default function Page() {
  return (
    <ComingSoon
      title={"Complaints"}
      description={"User complaint tickets, triage and resolution tracking. Coming in a later phase."}
    />
  )
}
