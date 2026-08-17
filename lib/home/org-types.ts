// Organisation types presented in the Frequency Home onboarding. These use the
// spec's church/ministry-facing labels while mapping onto the EXISTING
// OrgCategory values (lib/org-types.ts) so a Home's organisation stays fully
// compatible with org discovery, profiles and the admin console. No duplicate
// category system.

import type { OrgCategory } from "@/lib/org-types"

export type HomeOrgTypeId =
  | "church"
  | "ministry"
  | "youth_ministry"
  | "christian_organisation"
  | "christian_community"
  | "other"

export type HomeOrgType = {
  id: HomeOrgTypeId
  label: string
  description: string
  // How this maps to the underlying organisation.category column.
  category: OrgCategory
  // When the mapped category is "other", the specific label to store.
  categoryOther?: string
}

export const HOME_ORG_TYPES: HomeOrgType[] = [
  { id: "church", label: "Church", description: "A local or multi-site church", category: "church" },
  { id: "ministry", label: "Ministry", description: "A ministry or outreach", category: "ministry" },
  {
    id: "youth_ministry",
    label: "Youth Ministry",
    description: "Youth, students or young adults",
    category: "youth_group",
  },
  {
    id: "christian_organisation",
    label: "Christian Organisation",
    description: "A non-profit or organisation",
    category: "other",
    categoryOther: "Christian Organisation",
  },
  {
    id: "christian_community",
    label: "Christian Community",
    description: "A community or fellowship",
    category: "other",
    categoryOther: "Christian Community",
  },
  { id: "other", label: "Other", description: "Something else", category: "other" },
]

export function getHomeOrgType(id: string): HomeOrgType {
  return HOME_ORG_TYPES.find((t) => t.id === id) ?? HOME_ORG_TYPES[HOME_ORG_TYPES.length - 1]
}
