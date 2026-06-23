export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function getHandle(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16)
  return "@" + (slug || "listener")
}

// A small palette so each user gets a stable avatar color derived from their id.
const avatarColors = [
  "bg-primary/20 text-primary",
  "bg-chart-2/20 text-chart-2",
  "bg-chart-3/20 text-chart-3",
  "bg-chart-4/20 text-chart-4",
]

export function getAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return avatarColors[hash % avatarColors.length]
}

// The raw color tokens behind each avatar color, plus a complementary hue, so a
// profile banner can render a two-tone gradient that matches the user's avatar.
const avatarGradientTokens: { from: string; to: string }[] = [
  { from: "--primary", to: "--chart-2" },
  { from: "--chart-2", to: "--chart-3" },
  { from: "--chart-3", to: "--chart-4" },
  { from: "--chart-4", to: "--primary" },
]

/** Returns the gradient color tokens for a user's profile banner, derived from their id. */
export function getAvatarGradient(seed: string): { from: string; to: string } {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return avatarGradientTokens[hash % avatarGradientTokens.length]
}
