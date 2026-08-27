import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  FileText,
  Users,
  MessagesSquare,
  MessageSquareQuote,
  Radio,
  CalendarDays,
  CalendarCheck,
  CalendarClock,
  Video,
  HeartHandshake,
  Bell,
  BarChart3,
  CreditCard,
  Settings,
} from "lucide-react"
import type { HomePermission } from "@/lib/home/roles"

export type HomeAdminSection = {
  /** URL slug under /org/[handle]/admin/[slug]. "overview" is the index. */
  slug: string
  label: string
  icon: LucideIcon
  /** Short description shown on placeholder sections. */
  description: string
  /** Minimum permission required to see the section (undefined = any admin). */
  permission?: HomePermission
  /** Whether the section is functional now or a reserved placeholder. */
  ready: boolean
}

/**
 * The 12-section Home Admin Console navigation. Every future phase populates a
 * section here without restructuring the console. Sections gate on Home
 * permissions so a Moderator sees a different console than an Owner.
 */
export const HOME_ADMIN_SECTIONS: HomeAdminSection[] = [
  {
    slug: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "A pulse on your Home — members, activity and subscription at a glance.",
    ready: true,
  },
  {
    slug: "content",
    label: "Content",
    icon: FileText,
    description: "Publish announcements, articles, the Daily Devotional and media to your members.",
    permission: "content.manage",
    ready: true,
  },
  {
    slug: "members",
    label: "Members",
    icon: Users,
    description: "Review, approve and manage the people in your Home and their roles.",
    permission: "members.manage",
    ready: true,
  },
  {
    slug: "community",
    label: "Community",
    icon: MessagesSquare,
    description: "Moderate your private feed and community help conversations.",
    permission: "community.moderate",
    ready: false,
  },
  {
    slug: "review-tab",
    label: "Review Tab",
    icon: MessageSquareQuote,
    description: "Choose what the reviews tab is called in your Home — Testimonials, Praise Reports or Feedback.",
    permission: "home.manage",
    ready: true,
  },
  {
    slug: "rooms",
    label: "Rooms",
    icon: Radio,
    description: "Create and schedule private audio and video rooms for your members.",
    permission: "rooms.manage",
    ready: false,
  },
  {
    slug: "events",
    label: "Events",
    icon: CalendarDays,
    description: "See who has registered for the events you've published, and email your attendees.",
    permission: "events.manage",
    ready: true,
  },
  {
    slug: "live",
    label: "Live",
    icon: Video,
    description: "Broadcast live services and sessions privately to your Home.",
    permission: "live.manage",
    ready: false,
  },
  {
    slug: "bookings",
    label: "Bookings",
    icon: CalendarCheck,
    description: "Triage booking requests from your members — confirm, decline or complete them.",
    permission: "bookings.manage",
    ready: true,
  },
  {
    slug: "appointments",
    label: "Appointments",
    icon: CalendarClock,
    description: "Schedule and manage appointments between members and your team.",
    permission: "appointments.manage",
    ready: true,
  },
  {
    slug: "pastoral",
    label: "Pastoral",
    icon: HeartHandshake,
    description: "Prayer requests, care follow-ups and confidential pastoral notes.",
    permission: "pastoral.manage",
    ready: false,
  },
  {
    slug: "notifications",
    label: "Notifications",
    icon: Bell,
    description: "Send targeted announcements and push updates to your members.",
    permission: "notifications.send",
    ready: false,
  },
  {
    slug: "analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "Understand engagement, growth and reach across your Home.",
    permission: "analytics.view",
    ready: false,
  },
  {
    slug: "subscription",
    label: "Subscription",
    icon: CreditCard,
    description: "Manage your Frequency Home plan and billing.",
    permission: "subscription.manage",
    ready: true,
  },
  {
    slug: "settings",
    label: "Settings",
    icon: Settings,
    description: "Branding, privacy, join policy and your organisation profile.",
    permission: "home.manage",
    ready: true,
  },
]

export function getHomeAdminSection(slug: string): HomeAdminSection | undefined {
  return HOME_ADMIN_SECTIONS.find((s) => s.slug === slug)
}
