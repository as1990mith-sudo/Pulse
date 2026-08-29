import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { confirmAppointmentPaid } from "@/app/actions/home-appointments"

// Stripe delivers raw bytes; the body must not be parsed before signature check.
export const runtime = "nodejs"

/**
 * Backstop reconciler for paid appointments. The embedded checkout also calls
 * confirmAppointmentPaid() from its onComplete handler, but if the member closes
 * the tab before that fires, this webhook still flips the appointment to paid and
 * creates the linked conversation. confirmAppointmentPaid is idempotent, so a
 * double delivery (webhook + client) is safe.
 *
 * Configure the endpoint URL in the Stripe dashboard and set STRIPE_WEBHOOK_SECRET.
 * Without the secret we skip verification-dependent handling rather than trust an
 * unsigned payload.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = req.headers.get("stripe-signature")
  const payload = await req.text()

  if (!secret || !signature) {
    // No verified secret configured — acknowledge without acting on unsigned data.
    return NextResponse.json({ received: true, verified: false })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret)
  } catch (err) {
    console.log("[v0] stripe webhook signature verification failed:", (err as Error).message)
    return NextResponse.json({ error: "invalid signature" }, { status: 400 })
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as { metadata?: Record<string, string> | null }
    const appointmentId = session.metadata?.appointmentId
    if (session.metadata?.kind === "home_appointment" && appointmentId) {
      try {
        await confirmAppointmentPaid(appointmentId)
      } catch (err) {
        console.log("[v0] appointment webhook reconcile failed:", (err as Error).message)
        return NextResponse.json({ error: "reconcile failed" }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ received: true })
}
