// Role-Based Access Control for the Frequency Admin Console.
// Designed to be expanded: add a permission key, then grant it to roles here.
// Identity is always the permanent user.id — never a display name.

export type AdminRole =
  | "super_admin"
  | "administrator"
  | "moderator"
  | "content_manager"
  | "customer_support"
  | "analytics_viewer"

export type Permission =
  | "roles.manage" // create/edit admin members + roles (super only)
  | "users.view"
  | "users.moderate" // suspend/ban/verify/warn/reset
  | "reports.view"
  | "reports.action" // dismiss/warn/hide/remove/restore/delete
  | "support.view"
  | "support.manage"
  | "books.review" // approve/reject/request changes
  | "devotionals.manage"
  | "articles.manage"
  | "events.manage"
  | "livestreams.manage"
  | "broadcast.send"
  | "push.send"
  | "analytics.view"
  | "infrastructure.view"
  | "security.view"
  | "settings.manage"

export const ALL_PERMISSIONS: Permission[] = [
  "roles.manage",
  "users.view",
  "users.moderate",
  "reports.view",
  "reports.action",
  "support.view",
  "support.manage",
  "books.review",
  "devotionals.manage",
  "articles.manage",
  "events.manage",
  "livestreams.manage",
  "broadcast.send",
  "push.send",
  "analytics.view",
  "infrastructure.view",
  "security.view",
  "settings.manage",
]

// Human-friendly labels + descriptions for the Roles/Permissions UI.
export const ROLE_META: Record<AdminRole, { label: string; description: string }> = {
  super_admin: {
    label: "Super Admin",
    description: "Full control over the platform, including roles and permissions.",
  },
  administrator: {
    label: "Administrator",
    description: "Broad operational control across users, content and moderation.",
  },
  moderator: {
    label: "Moderator",
    description: "Handles reports, content review and user moderation.",
  },
  content_manager: {
    label: "Content Manager",
    description: "Manages devotionals, articles, books, events and livestreams.",
  },
  customer_support: {
    label: "Customer Support",
    description: "Responds to complaints, contact requests and feedback.",
  },
  analytics_viewer: {
    label: "Analytics Viewer",
    description: "Read-only access to analytics and platform insights.",
  },
}

// The permission matrix. Super Admin implicitly has everything.
const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [...ALL_PERMISSIONS],
  administrator: [
    "users.view",
    "users.moderate",
    "reports.view",
    "reports.action",
    "support.view",
    "support.manage",
    "books.review",
    "devotionals.manage",
    "articles.manage",
    "events.manage",
    "livestreams.manage",
    "broadcast.send",
    "push.send",
    "analytics.view",
    "infrastructure.view",
    "security.view",
    "settings.manage",
  ],
  moderator: [
    "users.view",
    "users.moderate",
    "reports.view",
    "reports.action",
    "articles.manage",
    "events.manage",
    "livestreams.manage",
  ],
  content_manager: [
    "devotionals.manage",
    "articles.manage",
    "books.review",
    "events.manage",
    "livestreams.manage",
    "broadcast.send",
    "push.send",
  ],
  customer_support: ["users.view", "support.view", "support.manage"],
  analytics_viewer: ["analytics.view"],
}

export function permissionsForRole(role: AdminRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export function roleHasPermission(role: AdminRole, permission: Permission): boolean {
  if (role === "super_admin") return true
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission)
}

export const ROLE_ORDER: AdminRole[] = [
  "super_admin",
  "administrator",
  "moderator",
  "content_manager",
  "customer_support",
  "analytics_viewer",
]
