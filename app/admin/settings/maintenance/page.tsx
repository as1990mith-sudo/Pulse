import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Maintenance Mode · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Maintenance Mode"} description={"Schedule and toggle maintenance windows with member messaging."} />
}
