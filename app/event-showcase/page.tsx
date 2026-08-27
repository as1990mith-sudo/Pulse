import type { Metadata } from "next"
import { Playfair_Display } from "next/font/google"
import { EventDetailExperience } from "@/components/event-showcase/event-detail-experience"

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
})

export const metadata: Metadata = {
  title: "Night of Rescue · Prayer Palace International | Frequency",
  description: "A night of divine intervention, breakthrough and supernatural rescue. Register free.",
}

export const viewport = {
  themeColor: "#050505",
}

export default function EventShowcasePage() {
  return (
    <main className={playfair.variable}>
      <EventDetailExperience />
    </main>
  )
}
