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

/**
 * The clock time alone, e.g. "2:50 PM".
 *
 * Used for the per-message timestamp in a chat thread, where the day is already
 * established by a day separator above the message — repeating the date on every
 * bubble is the noise this replaces.
 */
export function formatChatClock(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/**
 * The label for a chat day separator: "Today", "Yesterday", a weekday for the
 * past week, then a full date beyond that.
 */
export function formatChatDay(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000)

  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days > 1 && days < 7) return d.toLocaleDateString([], { weekday: "long" })

  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(
    [],
    sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" },
  )
}

/** True when two timestamps fall on different calendar days for the viewer. */
export function isNewChatDay(current: number, previous: number | null): boolean {
  if (previous == null) return true
  const a = new Date(current)
  const b = new Date(previous)
  return (
    a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate()
  )
}
