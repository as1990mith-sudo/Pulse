import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { GuestManage } from "@/components/appointments/guest-manage"
import { getAppointmentByToken } from "@/app/actions/public-appointments"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Manage your appointment",
  robots: { index: false, follow: false },
}

export default async function AppointmentManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getAppointmentByToken(token)
  if (!view) notFound()

  return (
    <main className="min-h-dvh bg-background">
      <GuestManage initial={view} />
    </main>
  )
}
