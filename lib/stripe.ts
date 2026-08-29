import "server-only"

import Stripe from "stripe"

/**
 * Server-only Stripe client. The secret key is injected by the Stripe
 * integration (never exposed to the browser). Used to create and reconcile
 * Checkout Sessions for paid appointment types.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}
