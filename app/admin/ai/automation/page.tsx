import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Automation Rules · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Automation Rules"} description={"No-code rules that automate routine administrative actions."} />
}
