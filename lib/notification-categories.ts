/**
 * The notification category registry.
 *
 * Categories are the unit users actually control in settings, and they sit one
 * level above the `notification.type` values written by app code. That
 * indirection is the whole point: a new notification type only has to be listed
 * against an existing category here to inherit push delivery, an icon and a
 * user-facing toggle, with no schema change and no new settings UI.
 *
 * Deliberately shared (no "use server") so the server can decide eligibility and
 * the settings screen can render labels from exactly the same source.
 */

/** Every notification type currently written anywhere in the app. */
export type NotificationType =
  | "post"
  | "live"
  | "like"
  | "comment"
  | "follow"
  | "repost"
  | "mention"
  | "announcement"

export type NotificationCategory = "live" | "home" | "replies" | "reactions"

export type CategoryMeta = {
  key: NotificationCategory
  /** Types that belong to this category. */
  types: NotificationType[]
  label: string
  description: string
  /**
   * Whether a user with no stored row is opted in. Everything defaults on: the
   * user has already granted OS-level permission by this point, so silence would
   * be surprising. Kept explicit so a future noisy category can ship opt-in.
   */
  defaultEnabled: boolean
}

/**
 * Ordered by how much a member is likely to want the interruption: a Home going
 * live is time-critical and useless late, a like never is.
 */
export const NOTIFICATION_CATEGORIES: CategoryMeta[] = [
  {
    key: "live",
    types: ["live"],
    label: "Live sessions",
    description: "When a Home you belong to starts a public live.",
    defaultEnabled: true,
  },
  {
    key: "home",
    types: ["announcement", "post"],
    label: "Home activity",
    description: "Announcements and new posts from your Homes.",
    defaultEnabled: true,
  },
  {
    key: "replies",
    types: ["comment", "mention"],
    label: "Replies and mentions",
    description: "When someone replies to you or tags you by name.",
    defaultEnabled: true,
  },
  {
    key: "reactions",
    types: ["like", "follow", "repost"],
    label: "Likes and follows",
    description: "Likes, reposts and new followers.",
    defaultEnabled: true,
  },
]

/** Reverse index, built once, so eligibility checks stay a map lookup. */
const TYPE_TO_CATEGORY = new Map<NotificationType, NotificationCategory>(
  NOTIFICATION_CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.key] as const)),
)

/**
 * The category a type belongs to, or null for a type not yet registered.
 * Callers treat null as "deliver anyway": an unregistered type is a wiring
 * oversight, and dropping the notification silently would hide it entirely.
 */
export function categoryForType(type: string): NotificationCategory | null {
  return TYPE_TO_CATEGORY.get(type as NotificationType) ?? null
}

export function categoryMeta(key: NotificationCategory): CategoryMeta | undefined {
  return NOTIFICATION_CATEGORIES.find((c) => c.key === key)
}

/** Default preference map, used before a user has saved anything. */
export function defaultPreferences(): Record<NotificationCategory, boolean> {
  return NOTIFICATION_CATEGORIES.reduce(
    (acc, c) => ({ ...acc, [c.key]: c.defaultEnabled }),
    {} as Record<NotificationCategory, boolean>,
  )
}
