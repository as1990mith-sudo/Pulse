import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Content Review · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Content Review"} description={"Proactively review content flagged by the community or automated systems."} />
}
