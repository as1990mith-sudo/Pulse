import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { AppointmentsHub } from "@/components/appointments/appointments-hub"
import { getMyAppointments, listBookableTypes, type AppointmentTypeRow } from "@/app/actions/home-appointments"
import { getActiveHomeContext } from "@/lib/home/active-home"
import { getCurrentUser } from "@/lib/session"

export const metadata = {
  title: "Appointments",
  description: "Book, pay for and join your appointments — each with its own private conversation.",
}

export default async function AppointmentsPage() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in to view appointments</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Appointments are private sessions with your Home&apos;s team. Sign in to book and join.
          </p>
          <Link
            href="/sign-in"
            className="mt-6 inline-flex items-center rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </main>
      </div>
    )
  }

  const { home, mode } = await getActiveHomeContext()
  const activeHandle = mode === "home" && home ? home.handle : null

  let bookableTypes: AppointmentTypeRow[] = []
  if (activeHandle) {
    try {
      bookableTypes = await listBookableTypes(activeHandle)
    } catch {
      bookableTypes = []
    }
  }

  const appointments = await getMyAppointments()

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-primary/15 via-background to-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]"
      />
      <div className="relative">
        <SiteHeader />
        <main>
          <AppointmentsHub
            appointments={appointments}
            bookableTypes={bookableTypes}
            activeHandle={activeHandle}
            activeHomeName={activeHandle ? home?.orgName ?? null : null}
            publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
          />
        </main>
      </div>
    </div>
  )
}
