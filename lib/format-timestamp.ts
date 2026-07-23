/**
 * Reusable post-timestamp formatter shared across the social feed, comments
 * and replies so the behaviour is consistent app-wide.
 *
 * - Under 1 minute:  "now"
 * - Under 1 hour:    "5m"
 * - Under 24 hours:  "2h", "23h"
 * - 24 hours or more: the absolute date as dd/mm/yy (e.g. "18/07/26")
 *
 * Accepts a Date or a date-like value (ISO string / epoch ms).
 */
export function formatPostTimestamp(postDate: Date | string | number): string {
  const d = postDate instanceof Date ? postDate : new Date(postDate)
  const diffMs = Date.now() - d.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    if (diffMinutes < 1) return "now"
    return `${diffMinutes}m`
  }

  if (diffHours < 24) {
    return `${Math.floor(diffHours)}h`
  }

  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}
