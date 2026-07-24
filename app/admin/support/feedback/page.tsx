import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Feedback · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Feedback"} description={"Product feedback and feature requests gathered from the community."} />
}
