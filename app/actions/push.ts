"use server"

import { and, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notificationPreference, pushSubscription } from "@/lib/db/schema"
import {
  NOTIFICATION_CATEGORIES,
  defaultPreferences,
  type NotificationCategory,
} from "@/lib/notification-categories"

const VALID_CATEGORIES = new Set<string>(NOTIFICATION_CATEGORIES.map((c) => c.key))

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

/**
 * Stores (or refreshes) the calling user's push endpoint for this device.
 *
 * Upserts on the endpoint rather than inserting, for two reasons: a browser
 * hands back the same endpoint when a page re-subscribes, and an endpoint can
 * be reassigned to a different account when two people share a device — in
 * which case the row must follow the new owner instead of quietly pushing that
 * person's notifications to the previous one.
 */
export async function savePushSubscription(input: {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: "Sign in to enable notifications." }
  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { ok: false, error: "Incomplete subscription." }
  }

  await db
    .insert(pushSubscription)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    })

  return { ok: true }
}

/** Forgets a single device, e.g. when the browser reports the subscription gone. */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  const userId = await currentUserId()
  if (!userId || !endpoint) return
  // Scoped to the owner so an endpoint string cannot be used to unsubscribe
  // somebody else's device.
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
}

export type NotificationPreferences = Record<NotificationCategory, boolean>

/**
 * The user's category preferences, with registry defaults filled in for any
 * category they have never explicitly touched.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const prefs = defaultPreferences()
  const userId = await currentUserId()
  if (!userId) return prefs

  const rows = await db
    .select({ category: notificationPreference.category, enabled: notificationPreference.enabled })
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, userId))

  for (const row of rows) {
    if (VALID_CATEGORIES.has(row.category)) {
      prefs[row.category as NotificationCategory] = row.enabled
    }
  }
  return prefs
}

/** Turns one category on or off for the calling user. */
export async function updateNotificationPreference(
  category: NotificationCategory,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: "Sign in to change notification settings." }
  // Reject anything not in the registry so a stale client cannot write a
  // category that no eligibility check will ever read.
  if (!VALID_CATEGORIES.has(category)) return { ok: false, error: "Unknown category." }

  await db
    .insert(notificationPreference)
    .values({ userId, category, enabled })
    .onConflictDoUpdate({
      target: [notificationPreference.userId, notificationPreference.category],
      set: { enabled, updatedAt: new Date() },
    })

  return { ok: true }
}

/** How many devices are currently registered, for the settings summary line. */
export async function getPushDeviceCount(): Promise<number> {
  const userId = await currentUserId()
  if (!userId) return 0
  const rows = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
  return rows.length
}

/**
 * Removes every registered device for the calling user. Used by the settings
 * "turn off on all devices" control, which has to work even from a device that
 * is not itself subscribed.
 */
export async function clearPushSubscriptions(): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return
  await db.delete(pushSubscription).where(eq(pushSubscription.userId, userId))
}

/**
 * Endpoints belonging to a set of users — used by the fan-out path only.
 * Exported for tests; not called from the client.
 */
export async function endpointsForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []
  const rows = await db
    .select({ endpoint: pushSubscription.endpoint })
    .from(pushSubscription)
    .where(inArray(pushSubscription.userId, userIds))
  return rows.map((r) => r.endpoint)
}
