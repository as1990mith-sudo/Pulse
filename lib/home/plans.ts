// Frequency Home subscription plans. This is the single source of truth for
// pricing, plan capabilities and the grouped feature detail so everything the
// Subscription UI renders can change here without touching components or
// billing logic.
//
// Plan IDs stay "premium" | "premium_pro" (already persisted in `home.plan`);
// only the customer-facing NAMES are "Basic" / "Premium". Renaming the display
// name never touches the stored id, so no data migration is needed.

export type HomePlanId = "premium" | "premium_pro"

export type BillingInterval = "monthly" | "annual"

// A named group of features shown in the full plan detail (e.g. "Live").
export type PlanFeatureGroup = { label: string; features: string[] }

export type HomePlan = {
  id: HomePlanId
  name: string
  // Placeholder prices in whole USD. Nothing derives a real charge from these
  // yet — annual is billed as one payment; `priceAnnual` is the yearly total.
  priceMonthly: number
  priceAnnual: number
  currency: string
  tagline: string
  // Short positioning line shown under the plan name.
  positioning: string
  // Short highlights for the compact selection card (keep to ~5).
  features: string[]
  // Full, grouped feature detail shown when a plan is opened.
  featureGroups: PlanFeatureGroup[]
  // Premium Pro can publish selected Home content to the wider Universal
  // community. Basic cannot. Drives capability checks across the app.
  canPublishToUniversal: boolean
  // Highlights the advanced plan in the UI (subtle, restrained emphasis).
  featured: boolean
  // The subtly-recommended plan. Currently the advanced plan.
  recommended: boolean
}

// Feature groups shared by every plan. Premium layers extra groups on top.
const CORE_GROUPS: PlanFeatureGroup[] = [
  {
    label: "Community",
    features: ["Member management", "Home messaging", "Home Broadcast", "Posts & interactions", "Roles & permissions"],
  },
  {
    label: "Events",
    features: [
      "Event creation",
      "Registration",
      "Member & guest registration",
      "Registrant management",
      "Spreadsheet export",
      "Registrant email broadcasts",
    ],
  },
  {
    label: "Live",
    features: ["Audio live", "Video live", "Conversations", "Broadcasts", "Replays", "Screen sharing", "Resources"],
  },
  {
    label: "Content",
    features: ["Notice Board", "Catalogue", "Organisation branding"],
  },
]

export const HOME_PLANS: Record<HomePlanId, HomePlan> = {
  premium: {
    id: "premium",
    name: "Basic",
    priceMonthly: 40,
    priceAnnual: 384, // 20% off 12 months
    currency: "USD",
    tagline: "Your organisation's private digital home.",
    positioning: "Everything you need to create your organisation's private digital home.",
    features: [
      "Members & roles",
      "Events & registration",
      "Audio & video live",
      "Notice Board & Catalogue",
      "Organisation branding",
    ],
    featureGroups: CORE_GROUPS,
    canPublishToUniversal: false,
    featured: false,
    recommended: false,
  },
  premium_pro: {
    id: "premium_pro",
    name: "Premium",
    priceMonthly: 70,
    priceAnnual: 672, // 20% off 12 months
    currency: "USD",
    tagline: "Reach beyond your Home.",
    positioning: "Everything in Basic, plus reach into the wider Frequency community.",
    features: [
      "Everything in Basic",
      "Publish to Universal",
      "Featured discovery",
      "Advanced analytics",
      "Priority support",
    ],
    featureGroups: [
      ...CORE_GROUPS,
      {
        label: "Reach",
        features: ["Publish to Frequency Universal", "Featured discovery", "Wider community reach"],
      },
      {
        label: "Insights",
        features: ["Advanced analytics", "Priority support"],
      },
    ],
    canPublishToUniversal: true,
    featured: true,
    recommended: true,
  },
}

export const HOME_PLAN_ORDER: HomePlanId[] = ["premium", "premium_pro"]

export const HOME_PLAN_LIST: HomePlan[] = HOME_PLAN_ORDER.map((id) => HOME_PLANS[id])

// Compact matrix for the optional "Compare plans" view. Kept deliberately
// short — the primary experience is choose → view → subscribe, not a matrix.
export const HOME_PLAN_COMPARISON: { label: string; basic: boolean; premium: boolean }[] = [
  { label: "Members & roles", basic: true, premium: true },
  { label: "Events & registration", basic: true, premium: true },
  { label: "Registrant export", basic: true, premium: true },
  { label: "Audio & video live", basic: true, premium: true },
  { label: "Live replays", basic: true, premium: true },
  { label: "Notice Board & Catalogue", basic: true, premium: true },
  { label: "Publish to Universal", basic: false, premium: true },
  { label: "Featured discovery", basic: false, premium: true },
  { label: "Advanced analytics", basic: false, premium: true },
  { label: "Priority support", basic: false, premium: true },
]

export function getHomePlan(id: string | null | undefined): HomePlan {
  if (id && id in HOME_PLANS) return HOME_PLANS[id as HomePlanId]
  return HOME_PLANS.premium
}

export function isHomePlanId(id: string): id is HomePlanId {
  return id in HOME_PLANS
}

export function isBillingInterval(v: string): v is BillingInterval {
  return v === "monthly" || v === "annual"
}

/** The price (whole units) for a plan at the given billing interval. */
export function priceFor(plan: HomePlan, interval: BillingInterval): number {
  return interval === "annual" ? plan.priceAnnual : plan.priceMonthly
}

/** Formats whole-unit money for a plan's currency, e.g. "$40". */
export function formatMoney(amount: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : ""
  return `${symbol}${amount}`
}

/** Legacy helper (monthly price) still used by the onboarding plan cards. */
export function formatHomePrice(plan: HomePlan): string {
  return formatMoney(plan.priceMonthly, plan.currency)
}

/** Rounded per-month cost when paying annually, e.g. 384 / 12 → 32. */
export function monthlyEquivalent(plan: HomePlan): number {
  return Math.round(plan.priceAnnual / 12)
}

/** Whole-unit money saved over a year by paying annually vs monthly. */
export function annualSavings(plan: HomePlan): number {
  return plan.priceMonthly * 12 - plan.priceAnnual
}

/** Percentage saved by paying annually, rounded, e.g. 20. */
export function annualSavingsPercent(plan: HomePlan): number {
  const monthlyYear = plan.priceMonthly * 12
  if (monthlyYear <= 0) return 0
  return Math.round((1 - plan.priceAnnual / monthlyYear) * 100)
}
