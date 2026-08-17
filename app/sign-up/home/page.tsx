import type { Metadata } from "next"
import { HomeOnboarding } from "@/components/home/onboarding/home-onboarding"

export const metadata: Metadata = {
  title: "Create a Frequency Home",
  description: "Create a private digital home for your church, ministry or organisation.",
}

export default function CreateHomePage() {
  return (
    <main className="min-h-svh bg-background">
      <HomeOnboarding />
    </main>
  )
}
