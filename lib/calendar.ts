export type CalendarEvent = {
  title: string
  description?: string | null
  location?: string | null
  /** YYYY-MM-DD */
  date: string
  /** HH:MM (24h), optional. Defaults to an all-day-ish 1h block at 18:00. */
  time?: string | null
}

/** Returns { start, end } as Date objects. Defaults to a 1-hour block. */
function getRange(event: CalendarEvent): { start: Date; end: Date; allDay: boolean } {
  const [y, m, d] = event.date.split("-").map(Number)
  if (event.time) {
    const [hh, mm] = event.time.split(":").map(Number)
    const start = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    return { start, end, allDay: false }
  }
  const start = new Date(y, (m ?? 1) - 1, d ?? 1)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end, allDay: true }
}

/** Format a Date as UTC basic format: 20240115T180000Z */
function toUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/** Format a Date as a local all-day date: 20240115 */
function toDateStamp(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

/** Builds a Google Calendar "add event" URL. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const { start, end, allDay } = getRange(event)
  const dates = allDay
    ? `${toDateStamp(start)}/${toDateStamp(end)}`
    : `${toUtcStamp(start)}/${toUtcStamp(end)}`
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
  })
  if (event.description) params.set("details", event.description)
  if (event.location) params.set("location", event.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Builds the contents of an .ics file (works with Apple Calendar, Outlook). */
export function buildIcs(event: CalendarEvent): string {
  const { start, end, allDay } = getRange(event)
  const dtStart = allDay ? `DTSTART;VALUE=DATE:${toDateStamp(start)}` : `DTSTART:${toUtcStamp(start)}`
  const dtEnd = allDay ? `DTEND;VALUE=DATE:${toDateStamp(end)}` : `DTEND:${toUtcStamp(end)}`
  const escape = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n")

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Frequency//Announcements//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@frequency`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escape(event.title)}`,
    event.description ? `DESCRIPTION:${escape(event.description)}` : "",
    event.location ? `LOCATION:${escape(event.location)}` : "",
    // Reminder 1 day before, and 1 hour before.
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(event.title)}`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(event.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean)

  return lines.join("\r\n")
}

/** Triggers a client-side download of an .ics file for the event. */
export function downloadIcs(event: CalendarEvent) {
  const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Human-readable date label, e.g. "Sat, Jan 20 · 6:00 PM". */
export function formatEventDate(date: string, time?: string | null): string {
  const [y, m, d] = date.split("-").map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  const datePart = dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  if (!time) return datePart
  const [hh, mm] = time.split(":").map(Number)
  const tdt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0)
  const timePart = tdt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${datePart} · ${timePart}`
}
