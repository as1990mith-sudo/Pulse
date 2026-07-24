import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Terms · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Terms"} description={"Maintain the platform terms of service shown to members."} />
}
