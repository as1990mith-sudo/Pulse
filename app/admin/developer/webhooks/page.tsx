import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Webhooks · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Webhooks"} description={"Subscribe external systems to platform events."} />
}
