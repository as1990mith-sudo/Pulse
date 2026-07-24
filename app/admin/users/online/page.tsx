import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Online Users · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Online Users"} description={"See who is active on Frequency in real time, with session and device detail."} />
}
