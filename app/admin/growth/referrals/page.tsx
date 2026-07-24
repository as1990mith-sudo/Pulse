import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Referrals · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Referrals"} description={"Referral program tracking and rewards — arriving in a future release."} />
}
