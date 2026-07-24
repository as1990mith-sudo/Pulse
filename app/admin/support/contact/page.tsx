import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Contact Requests · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Contact Requests"} description={"Inbound contact-form submissions routed into the support workflow."} />
}
