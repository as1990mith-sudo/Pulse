// Frequency Home subscription plans. This is the single source of truth for
// pricing and plan capabilities so prices (currently placeholders) and feature
// lists can be changed in one place without touching UI or billing logic.

export type HomePlanId = "premium" | "premium_pro"

export type HomePlan = {
  id: HomePlanId
  name: string
  // Placeholder monthly price in whole USD. Change freely — nothing derives a
  // real charge from this yet.
  priceMonthly: number
  currency: string
  tagline: string
  // Short positioning line shown under the plan name.
  positioning: string
  features: string[]
  // Premium Pro can publish selected Home content to the wider Universal
  // community. Premium cannot. Drives capability checks across the app.
  canPublishToUniversal: boolean
  // Highlights the advanced plan in the UI (subtle, restrained emphasis).
  featured: boolean
}

export const HOME_PLANS: Record<HomePlanId, HomePlan> = {
  premium: {
    id: "premium",
    name: "Premium",
    priceMonthly: 40,
    currency: "USD",
    tagline: "Your organisation's private digital home.",
    positioning: "Everything you need to create your organisation's private digital home.",
    features: [
      "Private organisation Home",
      "Unlimited members via authorisation key",
      "Private feed, announcements & community",
      "Rooms, events & live gatherings",
      "Roles & member management",
      "Organisation branding",
    ],
    canPublishToUniversal: false,
    featured: false,
  },
  premium_pro: {
    id: "premium_pro",
    name: "Premium Pro",
    priceMonthly: 70,
    currency: "USD",
    tagline: "Reach beyond your Home.",
    positioning:
      "Everything in Premium, plus the ability to publish selected content to the wider Frequency community.",
    features: [
      "Everything in Premium",
      "Publish selected content to Frequency Universal",
      "Reach the wider Christian community",
      "Featured organisation discovery",
      "Advanced analytics & insights",
      "Priority support",
    ],
    canPublishToUniversal: true,
    featured: true,
  },
}

export const HOME_PLAN_ORDER: HomePlanId[] = ["premium", "premium_pro"]

export const HOME_PLAN_LIST: HomePlan[] = HOME_PLAN_ORDER.map((id) => HOME_PLANS[id])

export function getHomePlan(id: string | null | undefined): HomePlan {
  if (id && id in HOME_PLANS) return HOME_PLANS[id as HomePlanId]
  return HOME_PLANS.premium
}

export function isHomePlanId(id: string): id is HomePlanId {
  return id in HOME_PLANS
}

/** Formats a plan's price for display, e.g. "$40". */
export function formatHomePrice(plan: HomePlan): string {
  const symbol = plan.currency === "USD" ? "$" : ""
  return `${symbol}${plan.priceMonthly}`
}
