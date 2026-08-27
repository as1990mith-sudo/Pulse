import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google"
import { RegistrationsDeck } from "@/components/registrations-deck"

// Three faces, each with a job: Space Grotesk is the "loud" display face,
// Inter is the "quiet" body face, IBM Plex Mono is the technical label layer.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-deck-display",
})
const inter = Inter({ subsets: ["latin"], variable: "--font-deck-body" })
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-deck-mono",
})

export const metadata = {
  title: "Registrations — Command Deck",
  description: "Admin registrations dashboard for the events platform.",
}

export default function Page() {
  return (
    <div className={`${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable}`}>
      <RegistrationsDeck />
    </div>
  )
}
