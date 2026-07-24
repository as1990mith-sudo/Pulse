import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: "Livestreams · Frequency Admin" }

export default function Page() {
  return <ComingSoon title={"Livestreams"} description={"Monitor active broadcasts, feature streams, and act on livestream reports."} />
}
