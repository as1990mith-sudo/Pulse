import type { LucideIcon } from "lucide-react"
import {
  Activity,
  BadgeCheck,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Bot,
  Brain,
  CalendarDays,
  Cog,
  Command,
  CreditCard,
  Database,
  DollarSign,
  FileText,
  FileWarning,
  Flag,
  Gauge,
  GitBranch,
  Globe,
  HandCoins,
  HardDrive,
  Heart,
  History,
  Home,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Lock,
  MailQuestion,
  Megaphone,
  MessageSquareWarning,
  Radio,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  UserCog,
  Wand2,
  Webhook,
  Wifi,
} from "lucide-react"
import type { Permission } from "@/lib/rbac"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  /** "ready" = implemented in Phase 1, "soon" = premium placeholder. */
  status: "ready" | "soon"
  /** Permission required to see/use this item (super_admin always passes). */
  permission?: Permission
  /** Optional keywords to improve command-palette / search matching. */
  keywords?: string
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Command Centre", href: "/admin", icon: LayoutDashboard, status: "ready", keywords: "home overview attention" },
      { label: "Platform Overview", href: "/admin/overview", icon: Gauge, status: "ready", keywords: "metrics summary" },
    ],
  },
  {
    label: "Users",
    items: [
      { label: "User Management", href: "/admin/users", icon: Users, status: "ready", permission: "users.view", keywords: "search accounts profile" },
      { label: "Online Users", href: "/admin/users/online", icon: Wifi, status: "ready", permission: "users.view", keywords: "active presence" },
      { label: "Verification", href: "/admin/users/verification", icon: BadgeCheck, status: "ready", permission: "users.moderate", keywords: "verified badge" },
      { label: "Suspensions", href: "/admin/users/suspensions", icon: Shield, status: "ready", permission: "users.moderate" },
      { label: "Bans", href: "/admin/users/bans", icon: Ban, status: "ready", permission: "users.moderate" },
      { label: "Admin Roles", href: "/admin/users/roles", icon: UserCog, status: "ready", permission: "roles.manage", keywords: "rbac permissions team" },
    ],
  },
  {
    label: "Moderation",
    items: [
      { label: "Reports", href: "/admin/moderation/reports", icon: Flag, status: "ready", permission: "reports.view", keywords: "abuse flagged" },
      { label: "Content Review", href: "/admin/moderation/review", icon: ListChecks, status: "ready", permission: "reports.view" },
      { label: "Removed Content", href: "/admin/moderation/removed", icon: Trash2, status: "ready", permission: "reports.view", keywords: "deleted hidden" },
      { label: "Appeals", href: "/admin/moderation/appeals", icon: MessageSquareWarning, status: "soon", permission: "reports.view" },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Complaints", href: "/admin/support/complaints", icon: LifeBuoy, status: "ready", permission: "support.view", keywords: "tickets help" },
      { label: "Contact Requests", href: "/admin/support/contact", icon: MailQuestion, status: "ready", permission: "support.view" },
      { label: "Feedback", href: "/admin/support/feedback", icon: Heart, status: "ready", permission: "support.view" },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Devotionals", href: "/admin/content/devotionals", icon: BookOpen, status: "ready", permission: "devotionals.manage", keywords: "daily verse" },
      { label: "Articles", href: "/admin/content/articles", icon: FileText, status: "ready", permission: "articles.manage", keywords: "posts writing" },
      { label: "Books", href: "/admin/content/books", icon: Boxes, status: "ready", permission: "books.review", keywords: "approval library pdf" },
      { label: "Livestreams", href: "/admin/content/livestreams", icon: Radio, status: "ready", permission: "livestreams.manage" },
      { label: "Events", href: "/admin/content/events", icon: CalendarDays, status: "ready", permission: "events.manage" },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Push Notifications", href: "/admin/communication/push", icon: Bell, status: "ready", permission: "push.send" },
      { label: "Broadcast Centre", href: "/admin/communication/broadcast", icon: Megaphone, status: "ready", permission: "broadcast.send", keywords: "announcement banner" },
    ],
  },
  {
    label: "Growth",
    items: [
      { label: "Analytics", href: "/admin/growth/analytics", icon: BarChart3, status: "ready", permission: "analytics.view" },
      { label: "Engagement", href: "/admin/growth/engagement", icon: Activity, status: "soon", permission: "analytics.view" },
      { label: "Retention", href: "/admin/growth/retention", icon: TrendingUp, status: "soon", permission: "analytics.view" },
      { label: "Referrals", href: "/admin/growth/referrals", icon: Sparkles, status: "soon", permission: "analytics.view" },
    ],
  },
  {
    label: "Revenue",
    items: [
      { label: "Subscriptions", href: "/admin/revenue/subscriptions", icon: CreditCard, status: "soon" },
      { label: "Donations", href: "/admin/revenue/donations", icon: HandCoins, status: "soon" },
      { label: "Creator Earnings", href: "/admin/revenue/earnings", icon: DollarSign, status: "soon" },
      { label: "Advertising", href: "/admin/revenue/advertising", icon: Megaphone, status: "soon" },
      { label: "Payouts", href: "/admin/revenue/payouts", icon: Boxes, status: "soon" },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { label: "Storage", href: "/admin/infrastructure/storage", icon: HardDrive, status: "ready", permission: "infrastructure.view" },
      { label: "Database", href: "/admin/infrastructure/database", icon: Database, status: "ready", permission: "infrastructure.view" },
      { label: "API Health", href: "/admin/infrastructure/api", icon: Server, status: "ready", permission: "infrastructure.view" },
      { label: "Logs", href: "/admin/infrastructure/logs", icon: ScrollText, status: "soon", permission: "infrastructure.view" },
      { label: "Cache", href: "/admin/infrastructure/cache", icon: Boxes, status: "soon", permission: "infrastructure.view" },
      { label: "Queue Monitoring", href: "/admin/infrastructure/queues", icon: Boxes, status: "soon", permission: "infrastructure.view" },
    ],
  },
  {
    label: "AI",
    items: [
      { label: "AI Moderation", href: "/admin/ai/moderation", icon: Bot, status: "soon" },
      { label: "AI Insights", href: "/admin/ai/insights", icon: Brain, status: "soon" },
      { label: "Automation Rules", href: "/admin/ai/automation", icon: Wand2, status: "soon" },
    ],
  },
  {
    label: "Security",
    items: [
      { label: "Audit Logs", href: "/admin/security/audit", icon: ScrollText, status: "ready", permission: "security.view", keywords: "trail history" },
      { label: "Login History", href: "/admin/security/logins", icon: History, status: "ready", permission: "security.view" },
      { label: "Sessions", href: "/admin/security/sessions", icon: KeyRound, status: "ready", permission: "security.view" },
      { label: "Permissions", href: "/admin/security/permissions", icon: Lock, status: "ready", permission: "security.view" },
    ],
  },
  {
    label: "Developer",
    items: [
      { label: "Feature Flags", href: "/admin/developer/flags", icon: Flag, status: "soon" },
      { label: "Integrations", href: "/admin/developer/integrations", icon: GitBranch, status: "soon" },
      { label: "Webhooks", href: "/admin/developer/webhooks", icon: Webhook, status: "soon" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "General", href: "/admin/settings/general", icon: Settings, status: "ready", permission: "settings.manage" },
      { label: "Community Guidelines", href: "/admin/settings/guidelines", icon: ShieldCheck, status: "ready", permission: "settings.manage" },
      { label: "Privacy Policy", href: "/admin/settings/privacy", icon: Lock, status: "ready", permission: "settings.manage" },
      { label: "Terms", href: "/admin/settings/terms", icon: ScrollText, status: "ready", permission: "settings.manage" },
      { label: "Maintenance Mode", href: "/admin/settings/maintenance", icon: Cog, status: "ready", permission: "settings.manage" },
    ],
  },
]

// Quick actions surfaced on the Command Centre and in the command palette.
export type QuickAction = {
  label: string
  href: string
  icon: LucideIcon
  permission?: Permission
}

export const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Devotional", href: "/admin/content/devotionals?new=1", icon: BookOpen, permission: "devotionals.manage" },
  { label: "Send Announcement", href: "/admin/communication/broadcast?new=1", icon: Megaphone, permission: "broadcast.send" },
  { label: "View Reports", href: "/admin/moderation/reports", icon: Flag, permission: "reports.view" },
  { label: "User Search", href: "/admin/users", icon: Users, permission: "users.view" },
  { label: "Publish Broadcast", href: "/admin/communication/push?new=1", icon: Bell, permission: "push.send" },
  { label: "Platform Settings", href: "/admin/settings/general", icon: Settings, permission: "settings.manage" },
]

export const HOME_ICON = Home
export const COMMAND_ICON = Command
export const GLOBE_ICON = Globe
export const WARN_ICON = FileWarning
