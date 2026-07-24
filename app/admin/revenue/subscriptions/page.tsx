import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Subscriptions · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Subscriptions"} description={"Recurring membership revenue, plans, and subscriber management."} />
}
