// Advertising pricing for promoted event announcements.
// $5 per 12 hours, up to a maximum of 72 hours.
export const AD_RATE_USD = 5
export const AD_BLOCK_HOURS = 12
export const AD_MAX_HOURS = 72

export function priceForHours(hours: number) {
  return (Math.ceil(hours / AD_BLOCK_HOURS) * AD_RATE_USD).toFixed(2)
}

// Dedicated system account used by admins to officially message ad creators.
export const FREQUENCY_TEAM_ID = "frequency-team"

// What is being advertised, and how viewers can respond to it.
export type AdType = "event" | "product"
export type AdAction = "interested" | "not_interested"
