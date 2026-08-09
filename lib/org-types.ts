// Shared organisation types + constants for the Frequency ministry ecosystem.
// Used by signup, the organisation profile, discovery, and the admin console.

export type OrgCategory =
  | "church"
  | "ministry"
  | "prayer_ministry"
  | "mission"
  | "youth_group"
  | "bible_teaching"
  | "christian_media"
  | "other"

export type OrgReach = "local" | "regional" | "global" | "online_only"

export type OrgVerificationStatus = "none" | "pending" | "approved" | "rejected"

export const ORG_CATEGORIES: { id: OrgCategory; label: string }[] = [
  { id: "church", label: "Church" },
  { id: "ministry", label: "Ministry" },
  { id: "prayer_ministry", label: "Prayer Ministry" },
  { id: "mission", label: "Mission Organisation" },
  { id: "youth_group", label: "Youth Group" },
  { id: "bible_teaching", label: "Bible Teaching" },
  { id: "christian_media", label: "Christian Media" },
  { id: "other", label: "Other" },
]

export const ORG_REACH: { id: OrgReach; label: string; description: string }[] = [
  { id: "local", label: "Local", description: "Serves a specific city or town" },
  { id: "regional", label: "Regional", description: "Serves a region, state or country" },
  { id: "global", label: "Global", description: "Serves audiences worldwide" },
  { id: "online_only", label: "Online Only", description: "Operates entirely online" },
]

export function orgCategoryLabel(id: string, other?: string | null): string {
  if (id === "other") return other?.trim() || "Other"
  return ORG_CATEGORIES.find((c) => c.id === id)?.label ?? "Ministry"
}

export function orgReachLabel(id: string): string {
  return ORG_REACH.find((r) => r.id === id)?.label ?? "Local"
}

export type OrgSocials = {
  instagram?: string
  youtube?: string
  facebook?: string
  twitter?: string
  other?: string
}

// A fully-resolved organisation for client rendering.
export type OrganizationView = {
  id: string
  ownerId: string
  name: string
  handle: string
  category: OrgCategory
  categoryOther: string | null
  categoryLabel: string
  description: string | null
  logo: string | null
  cover: string | null
  initials: string
  color: string
  reach: OrgReach
  reachLabel: string
  onlineOnly: boolean
  country: string | null
  city: string | null
  region: string | null
  locationLabel: string | null
  website: string | null
  socials: OrgSocials | null
  mission: string | null
  vision: string | null
  history: string | null
  beliefs: string | null
  contactEmail: string | null
  contactPhone: string | null
  verified: boolean
  verificationStatus: OrgVerificationStatus
  subscriberCount: number
  isOwner: boolean
  isSubscribed: boolean
  notify: boolean
}

/** Builds a readable single-line location, or null when none is set. */
export function orgLocationLabel(
  onlineOnly: boolean,
  city?: string | null,
  region?: string | null,
  country?: string | null,
): string | null {
  if (onlineOnly) return "Online ministry"
  const parts = [city, region, country].map((p) => p?.trim()).filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

/** Slugify a name into a URL-safe org handle candidate (no leading @). */
export function slugifyHandle(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
}
