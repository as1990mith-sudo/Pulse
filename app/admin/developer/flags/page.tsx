import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Feature Flags · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Feature Flags"} description={"Roll out and gate features safely with targeted flags."} />
}
