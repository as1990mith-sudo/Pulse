import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Privacy Policy · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Privacy Policy"} description={"Maintain the platform privacy policy shown to members."} />
}
