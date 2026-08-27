/**
 * Question shapes shared by the server and the browser.
 *
 * Deliberately free of `server-only` and of any database import: both the
 * registration form (a client component) and the server-side validator need
 * these definitions, so they cannot live in lib/events/registration.ts.
 */

/** Largest party size a single registration may claim. */
export const MAX_GUESTS = 20

/**
 * An event's registration question, as authored by an admin.
 *
 * "guests" is a number question with one extra behaviour: its answer also
 * populates the registration's `guests` column, so party size drives capacity
 * and admin head-counts instead of sitting inert in the answers blob. At most
 * one guests question per event is meaningful; the first one wins.
 */
export type EventQuestion = {
  id: string
  label: string
  type: "short" | "long" | "select" | "number" | "boolean" | "guests"
  required: boolean
  options?: string[]
}

export type RegistrationAnswers = Record<string, string | number | boolean>

/** Human label for each question type, used by the admin question builder. */
export const QUESTION_TYPE_LABELS: Record<EventQuestion["type"], string> = {
  short: "Short text",
  long: "Long text",
  select: "Choose one",
  number: "Number",
  boolean: "Yes / no",
  guests: "Number of guests",
}
