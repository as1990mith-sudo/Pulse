// Shared, client-safe Frequency Home types. No server-only imports here so
// these can be used by both server actions and client components.

import type { HomePlanId } from "@/lib/home/plans"
import type { HomeRole } from "@/lib/home/roles"

export type HomeJoinPolicy = "auto" | "approval"

export type HomeMembershipStatus = "active" | "pending"

// The fixed set of names an admin can give the "iTestify" tab in their Home.
// Purely a label — picking one renames the tab and changes nothing else. The
// first entry is the default every unconfigured Home shows.
export const REVIEW_TAB_OPTIONS = ["Testimonials", "Praise Reports", "Feedback"] as const
export type ReviewTabLabel = (typeof REVIEW_TAB_OPTIONS)[number]

// A fully-resolved Home for rendering: the private Home joined with its public
// organisation's identity (name, handle, branding).
export type HomeView = {
  id: string
  organizationId: string
  name: string
  handle: string
  plan: HomePlanId
  planStatus: string
  accentColor: string | null
  joinPolicy: HomeJoinPolicy
  status: string
  // The admin-chosen name for the iTestify tab in this Home (cosmetic label).
  reviewTabLabel: ReviewTabLabel
  // Pulled from the linked organisation for branding.
  orgName: string
  orgLogo: string | null
  orgCover: string | null
  orgDescription: string | null
  orgCategoryLabel: string
  orgInitials: string
  orgColor: string
  memberCount: number
  createdAt: string
}

// The current viewer's relationship to a Home.
export type HomeMembershipView = {
  role: HomeRole
  status: HomeMembershipStatus
  joinedVia: string
} | null

// A member row for the admin members table.
export type HomeMemberRow = {
  id: string
  userId: string
  name: string
  email: string
  image: string | null
  initials: string
  color: string
  role: HomeRole
  status: HomeMembershipStatus
  joinedVia: string
  joinedAt: string
  isViewer: boolean
}

export type HomeAuthKeyView = {
  id: string
  key: string
  active: boolean
  createdAt: string
}
