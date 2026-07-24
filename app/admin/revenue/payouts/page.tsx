import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Payouts · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Payouts"} description={"Scheduled payouts, balances, and transfer history for creators."} />
}
