import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Events · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Events"} description={"Edit, feature, and moderate community events across the platform."} />
}
