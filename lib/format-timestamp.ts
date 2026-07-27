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

/**
 * Timestamp formatter for chat message bubbles (chatrooms + DMs). Unlike the
 * feed's relative "5m / 2h / 32d" style, chats show the actual clock time so a
 * conversation reads like a normal messaging app:
 *
 * - Sent today:            just the time, e.g. "4:03 PM"
 * - Earlier this year:     date + time, e.g. "24 Jun, 4:03 PM"
 * - A previous year:       date + year + time, e.g. "24 Jun 2024, 4:03 PM"
 *
 * Uses the viewer's locale/timezone, so it must run on the client.
 *
 * Accepts a Date or a date-like value (ISO string / epoch ms).
 */
export function formatChatTimestamp(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value)
  const now = new Date()
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return time

  const sameYear = d.getFullYear() === now.getFullYear()
  const date = d.toLocaleDateString(
    [],
    sameYear
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" },
  )
  return `${date}, ${time}`
}
