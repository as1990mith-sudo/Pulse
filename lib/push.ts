/**
 * Server-side web push delivery.
 *
 * This is the only place that talks to push services. It is intentionally
 * fire-and-forget from the caller's point of view: a notification row is the
 * source of truth (it will be read in the notification centre regardless), and
 * a push service being slow or down must never fail the action that triggered
 * it — going live must not error because someone's phone is unreachable.
 */

import "server-only"
import webpush from "web-push"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { notificationPreference, pushSubscription } from "@/lib/db/schema"
import { categoryForType, defaultPreferences, type NotificationCategory } from "@/lib/notification-categories"

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
// Push services require a contact for the sender; mailto is the usual form.
const subject = process.env.VAPID_SUBJECT || "mailto:notifications@example.com"

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export type PushPayload = {
  title: string
  body: string
  /** In-app destination. The service worker uses this for the deep link. */
  link: string
  /**
   * Collapse key. Two notifications sharing a tag replace one another on the
   * device, so this must be UNIQUE per distinct event: two admins of the same
   * Home starting two separate lives have to survive as two notifications.
   */
  tag: string
  type: string
  /** Home display name, when the event belongs to a Home rather than a person. */
  homeName?: string | null
}

/**
 * Recipients who have not switched off the category this type belongs to.
 * Absence of a preference row means the category default applies, so this only
 * has to subtract explicit opt-outs.
 */
async function eligibleRecipients(userIds: string[], type: string): Promise<string[]> {
  const category = categoryForType(type)
  // An unregistered type is a wiring oversight rather than a user preference —
  // deliver it instead of silently dropping it.
  if (!category) return userIds
  if (defaultPreferences()[category] === undefined) return userIds

  const rows = await db
    .select({ userId: notificationPreference.userId, enabled: notificationPreference.enabled })
    .from(notificationPreference)
    .where(
      and(
        inArray(notificationPreference.userId, userIds),
        eq(notificationPreference.category, category as NotificationCategory),
      ),
    )

  const optedOut = new Set(rows.filter((r) => !r.enabled).map((r) => r.userId))
  return userIds.filter((id) => !optedOut.has(id))
}

/**
 * Delivers a payload to every device belonging to every eligible recipient.
 *
 * Never throws. Endpoints the push service reports as gone (404/410) are pruned,
 * because a stale subscription otherwise accumulates forever and every future
 * send wastes a request on it.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return
  if (!ensureConfigured()) return

  try {
    const recipients = await eligibleRecipients(userIds, payload.type)
    if (recipients.length === 0) return

    const subs = await db
      .select()
      .from(pushSubscription)
      .where(inArray(pushSubscription.userId, recipients))

    if (subs.length === 0) return

    const body = JSON.stringify(payload)
    const dead: string[] = []

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            // Live notifications are worthless if they arrive after the session
            // ends, so give the push service a bounded TTL rather than the
            // multi-week default.
            { TTL: payload.type === "live" ? 1800 : 86400, urgency: "high" },
          )
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) dead.push(s.endpoint)
        }
      }),
    )

    if (dead.length > 0) {
      await db.delete(pushSubscription).where(inArray(pushSubscription.endpoint, dead))
    }
  } catch (err) {
    // Swallow: the in-app notification row already exists, and the caller is a
    // user action (going live, posting) that must not fail over delivery.
    console.error("[v0] push delivery failed:", err)
  }
}

/** True when the server is able to sign push payloads at all. */
export function pushConfigured(): boolean {
  return Boolean(publicKey && privateKey)
}
