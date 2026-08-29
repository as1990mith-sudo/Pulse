"use client"

import { useCallback } from "react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { loadStripe, type Stripe } from "@stripe/stripe-js"

/**
 * Embedded Stripe Checkout for a paid appointment. The client secret comes from
 * the server booking action (which recomputes the price from the appointment
 * type — never trusting the client). On completion the parent reconciles the
 * payment server-side and reveals the conversation.
 */
let stripePromise: Promise<Stripe | null> | null = null
function getStripe(publishableKey: string) {
  if (!stripePromise) stripePromise = loadStripe(publishableKey)
  return stripePromise
}

export function AppointmentCheckout({
  clientSecret,
  publishableKey,
  onComplete,
}: {
  clientSecret: string
  publishableKey: string
  onComplete: () => void
}) {
  const options = {
    clientSecret,
    onComplete: useCallback(() => onComplete(), [onComplete]),
  }

  return (
    <div className="overflow-hidden rounded-xl">
      <EmbeddedCheckoutProvider stripe={getStripe(publishableKey)} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}
