import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Storage · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Storage"} description={"Object storage usage, growth, and asset management insight."} />
}
