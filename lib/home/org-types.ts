// Organisation types presented in the Frequency Home onboarding.
//
// Frequency Home is organisation-NEUTRAL at the platform level: a Home can be a
// church, a charity, a coaching practice, a school, a professional body, etc.
// These types map onto the EXISTING OrgCategory values (lib/org-types.ts) so a
// Home's organisation stays fully compatible with org discovery, profiles and
// the admin console — non-Christian types map onto the generic "other" category
// with a specific stored label. No duplicate category system.
//
// `faithBased` marks types for which faith-specific optional features (e.g. the
// Daily Devotional) are relevant by default. It never changes the core Home
// interface — it only influences which OPTIONAL modules are surfaced.

import type { OrgCategory } from "@/lib/org-types"

export type HomeOrgTypeId =
  | "church"
  | "ministry"
  | "christian_organisation"
  | "charity"
  | "nonprofit"
  | "community"
  | "coaching"
  | "education"
  | "youth"
  | "professional"
  | "other"

export type HomeOrgType = {
  id: HomeOrgTypeId
  label: string
  description: string
  // How this maps to the underlying organisation.category column.
  category: OrgCategory
  // When the mapped category is "other", the specific label to store.
  categoryOther?: string
  // Whether faith-specific optional features are relevant by default.
  faithBased?: boolean
}

export const HOME_ORG_TYPES: HomeOrgType[] = [
  { id: "church", label: "Church", description: "A local or multi-site church", category: "church", faithBased: true },
  {
    id: "ministry",
    label: "Ministry",
    description: "A ministry or outreach",
    category: "ministry",
    faithBased: true,
  },
  {
    id: "christian_organisation",
    label: "Christian Organisation",
    description: "A faith-based organisation",
    category: "other",
    categoryOther: "Christian Organisation",
    faithBased: true,
  },
  {
    id: "charity",
    label: "Charity",
    description: "A registered charity",
    category: "other",
    categoryOther: "Charity",
  },
  {
    id: "nonprofit",
    label: "Nonprofit",
    description: "A not-for-profit organisation",
    category: "other",
    categoryOther: "Nonprofit",
  },
  {
    id: "community",
    label: "Community Organisation",
    description: "A community group or collective",
    category: "other",
    categoryOther: "Community Organisation",
  },
  {
    id: "coaching",
    label: "Coaching & Mentorship",
    description: "Coaching, mentoring or training",
    category: "other",
    categoryOther: "Coaching & Mentorship",
  },
  {
    id: "education",
    label: "Education",
    description: "A school, academy or course provider",
    category: "other",
    categoryOther: "Education",
  },
  {
    id: "youth",
    label: "Youth Organisation",
    description: "Youth, students or young adults",
    category: "youth_group",
  },
  {
    id: "professional",
    label: "Professional Organisation",
    description: "A professional body or network",
    category: "other",
    categoryOther: "Professional Organisation",
  },
  { id: "other", label: "Other", description: "Something else", category: "other" },
]

export function getHomeOrgType(id: string): HomeOrgType {
  return HOME_ORG_TYPES.find((t) => t.id === id) ?? HOME_ORG_TYPES[HOME_ORG_TYPES.length - 1]
}

/** Whether the org type has faith-specific optional features (e.g. devotional). */
export function isFaithBasedOrgType(id: string): boolean {
  return !!getHomeOrgType(id).faithBased
}
