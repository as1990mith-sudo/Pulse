import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { GuestBooking } from "@/components/appointments/guest-booking"
import { getPublicBookableTypes, getPublicBookingHome } from "@/app/actions/public-appointments"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const home = await getPublicBookingHome(handle)
  if (!home) return { title: "Book an appointment" }
  return {
    title: `Book with ${home.name}`,
    description: home.tagline ?? `Book an appointment with ${home.name}.`,
  }
}

export default async function BookPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const home = await getPublicBookingHome(handle)
  if (!home) notFound()

  const types = await getPublicBookableTypes(home.homeId)
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""

  return (
    <main className="min-h-dvh bg-background">
      <GuestBooking home={home} types={types} publishableKey={publishableKey} />
    </main>
  )
}
