import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "AI Moderation · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"AI Moderation"} description={"Automated content safety scoring and assisted moderation."} />
}
