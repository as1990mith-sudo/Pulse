// Role-Based Access Control for a Frequency Home. Mirrors the platform admin
// RBAC (lib/rbac.ts) but scoped to a single organisation's Home. Identity is
// always the permanent user.id via a home_membership row — never a display name.
// Designed to be expanded: add a permission key, then grant it to roles here.

export type HomeRole =
  | "owner"
  | "administrator"
  | "content_manager"
  | "moderator"
  | "leader"
  | "member"

export type HomePermission =
  | "home.manage" // edit Home settings, branding, plan (owner/admin)
  | "members.view"
  | "members.manage" // approve/remove members, change roles
  | "authkey.manage" // view/copy/regenerate/disable the authorisation key
  | "content.manage" // announcements, articles, media
  | "community.moderate" // moderate the private feed & community help
  | "rooms.manage"
  | "events.manage"
  | "live.manage"
  | "pastoral.manage" // pastoral care / prayer requests
  | "notifications.send"
  | "analytics.view"
  | "bookings.manage" // triage booking requests
  | "appointments.manage" // schedule and manage appointments
  | "subscription.manage" // change plan / billing

export const ALL_HOME_PERMISSIONS: HomePermission[] = [
  "home.manage",
  "members.view",
  "members.manage",
  "authkey.manage",
  "content.manage",
  "community.moderate",
  "rooms.manage",
  "events.manage",
  "live.manage",
  "pastoral.manage",
  "notifications.send",
  "analytics.view",
  "bookings.manage",
  "appointments.manage",
  "subscription.manage",
]

export const HOME_ROLE_META: Record<HomeRole, { label: string; description: string }> = {
  owner: {
    label: "Owner",
    description: "Full control of the Home, including plan, billing and ownership.",
  },
  administrator: {
    label: "Administrator",
    description: "Broad operational control across members, content and settings.",
  },
  content_manager: {
    label: "Content Manager",
    description: "Publishes and manages announcements, media, events and rooms.",
  },
  moderator: {
    label: "Moderator",
    description: "Keeps the private community healthy and moderates content.",
  },
  leader: {
    label: "Pastor / Leader",
    description: "Leads pastoral care, prayer and community shepherding.",
  },
  member: {
    label: "Member",
    description: "A member of the Home with access to its private community.",
  },
}

// The permission matrix. Owner implicitly has everything.
const HOME_ROLE_PERMISSIONS: Record<HomeRole, HomePermission[]> = {
  owner: [...ALL_HOME_PERMISSIONS],
  administrator: [
    "home.manage",
    "members.view",
    "members.manage",
    "authkey.manage",
    "content.manage",
    "community.moderate",
    "rooms.manage",
    "events.manage",
    "live.manage",
    "pastoral.manage",
    "notifications.send",
    "analytics.view",
    "bookings.manage",
    "appointments.manage",
    "subscription.manage",
  ],
  content_manager: [
    "members.view",
    "content.manage",
    "rooms.manage",
    "events.manage",
    "live.manage",
    "notifications.send",
    "analytics.view",
  ],
  moderator: ["members.view", "community.moderate", "content.manage"],
  leader: ["members.view", "pastoral.manage", "community.moderate", "appointments.manage", "bookings.manage"],
  member: [],
}

export function homePermissionsForRole(role: HomeRole): HomePermission[] {
  return HOME_ROLE_PERMISSIONS[role] ?? []
}

export function homeRoleHasPermission(role: HomeRole | null | undefined, permission: HomePermission): boolean {
  if (!role) return false
  if (role === "owner") return true
  return (HOME_ROLE_PERMISSIONS[role] ?? []).includes(permission)
}

export const HOME_ROLE_ORDER: HomeRole[] = [
  "owner",
  "administrator",
  "content_manager",
  "moderator",
  "leader",
  "member",
]

/** Ordered role list with metadata — convenient for role pickers. */
export const HOME_ROLES: { id: HomeRole; label: string; description: string }[] = HOME_ROLE_ORDER.map((id) => ({
  id,
  label: HOME_ROLE_META[id].label,
  description: HOME_ROLE_META[id].description,
}))

/** Roles that grant access to the Home Admin Console (any management right). */
export function isHomeAdminRole(role: HomeRole | null | undefined): boolean {
  if (!role) return false
  return role !== "member"
}

export function homeRoleLabel(role: string | null | undefined): string {
  if (role && role in HOME_ROLE_META) return HOME_ROLE_META[role as HomeRole].label
  return "Member"
}
