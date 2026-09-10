import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  FileText,
  Users,
  MessageSquareQuote,
  CalendarDays,
  Megaphone,
  CalendarClock,
  CreditCard,
  Settings,
} from "lucide-react"
import type { HomePermission } from "@/lib/home/roles"

/**
 * Top-level groupings for the console navigation. Kept deliberately small —
 * the whole console is a handful of real areas, so we group them into four
 * intelligible buckets rather than a long flat list. "overview" is the console
 * home and lives above the groups.
 */
export type HomeAdminGroupId = "people" | "content" | "scheduling" | "organisation"

export const HOME_ADMIN_GROUPS: { id: HomeAdminGroupId; label: string }[] = [
  { id: "people", label: "People" },
  { id: "content", label: "Content" },
  { id: "scheduling", label: "Scheduling" },
  { id: "organisation", label: "Organisation" },
]

export type HomeAdminSection = {
  /** URL slug under /org/[handle]/admin/[slug]. "overview" is the index. */
  slug: string
  label: string
  icon: LucideIcon
  /** Which navigation group the section belongs to (overview has none). */
  group?: HomeAdminGroupId
  /** Minimum permission required to see the section (undefined = any admin). */
  permission?: HomePermission
}

/**
 * The Frequency Home Admin Console navigation — every section here is a real,
 * connected capability of the current product. There are intentionally no
 * placeholder, "coming soon" or speculative entries: if it is not implemented,
 * it is not in the console. Sections gate on the viewer's Home permission, so a
 * Moderator sees a smaller console than an Owner.
 */
export const HOME_ADMIN_SECTIONS: HomeAdminSection[] = [
  {
    slug: "overview",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    slug: "members",
    label: "Members",
    icon: Users,
    group: "people",
    permission: "members.manage",
  },
  {
    slug: "content",
    label: "Notice Board",
    icon: FileText,
    group: "content",
    permission: "content.manage",
  },
  {
    slug: "review-tab",
    label: "Review Tab",
    icon: MessageSquareQuote,
    group: "content",
    permission: "home.manage",
  },
  {
    slug: "events",
    label: "Events",
    icon: CalendarDays,
    group: "scheduling",
    permission: "events.manage",
  },
  {
    slug: "appointments",
    label: "Appointments",
    icon: CalendarClock,
    group: "scheduling",
    permission: "appointments.manage",
  },
  {
    slug: "broadcast",
    label: "Broadcast",
    icon: Megaphone,
    group: "content",
    permission: "notifications.send",
  },
  {
    slug: "settings",
    label: "Settings",
    icon: Settings,
    group: "organisation",
    permission: "home.manage",
  },
  {
    slug: "subscription",
    label: "Subscription",
    icon: CreditCard,
    group: "organisation",
    permission: "subscription.manage",
  },
]

export function getHomeAdminSection(slug: string): HomeAdminSection | undefined {
  return HOME_ADMIN_SECTIONS.find((s) => s.slug === slug)
}

/**
 * The order the primary destinations appear in the mobile bottom bar. The bar
 * shows Overview plus the first few of these the viewer can actually access,
 * with everything else reachable under "More".
 */
export const MOBILE_PRIMARY_ORDER = ["overview", "members", "events", "appointments"] as const
