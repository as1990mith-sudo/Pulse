import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Verification · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Verification"} description={"Review and grant verified status to trusted accounts and creators."} />
}
