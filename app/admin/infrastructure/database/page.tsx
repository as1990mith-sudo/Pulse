import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Database · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Database"} description={"Database health, capacity, and query performance at a glance."} />
}
