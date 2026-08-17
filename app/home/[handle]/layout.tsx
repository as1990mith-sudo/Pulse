import { getMyHomes, requireHomeMembership } from "@/lib/home/access"
import { getCurrentUser } from "@/lib/session"
import { homeRoleLabel, isHomeAdminRole } from "@/lib/home/roles"
import { DEFAULT_HOME_ACCENT, normalizeHex } from "@/lib/home/accent"
import { HomeShell } from "@/components/home/nav/home-shell"
import type { SpaceLink } from "@/components/home/nav/space-switcher"

// The private-Home layout. This is the single privacy boundary for every
// /home/[handle]/* surface: requireHomeMembership redirects non-members to the
// join flow, so no child page can render an organisation's content to someone
// who isn't an active member of it.
export default async function HomeLayout({
  params,
  children,
}: {
  params: Promise<{ handle: string }>
  children: React.ReactNode
}) {
  const { handle } = await params
  const [{ home, membership }, myHomes, viewer] = await Promise.all([
    requireHomeMembership(handle),
    getMyHomes(),
    getCurrentUser(),
  ])

  // "MY SPACES": Frequency Universal first, then every Home the member belongs
  // to. The current Home is guaranteed present via requireHomeMembership.
  const spaces: SpaceLink[] = [
    { handle: null, name: "Frequency Universal", logo: null, initials: "F", accent: DEFAULT_HOME_ACCENT },
    ...myHomes.map((h) => ({
      handle: h.handle,
      name: h.name,
      logo: h.orgLogo,
      initials: h.orgInitials,
      accent: normalizeHex(h.accentColor) ?? DEFAULT_HOME_ACCENT,
    })),
  ]

  return (
    <HomeShell
      home={home}
      viewer={{
        id: viewer?.id ?? "",
        name: viewer?.name ?? "Member",
        image: viewer?.image ?? null,
        initials: viewer?.initials ?? "M",
        roleLabel: homeRoleLabel(membership.role),
      }}
      spaces={spaces}
      canManage={isHomeAdminRole(membership.role)}
    >
      {children}
    </HomeShell>
  )
}
