import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { organization } from "@/lib/db/schema"
import { getActiveHomeContext } from "@/lib/home/active-home"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"

/**
 * THE single source of truth for "who is publishing this?".
 *
 * The rule, in full:
 *
 *   A user's role belongs to a SPECIFIC Home, never to the account. The
 *   currently active context decides the publishing identity — so the same
 *   person publishes as "Kingdom Academy" in the Home they administer, and as
 *   themselves one tap later in a Home where they are an ordinary member.
 *
 * What this deliberately does NOT do — and must never do — is ask "does this
 * user administer a Home anywhere?". That question produced the bug this module
 * replaces: `organization.ownerId = user.id` was consulted before the active
 * Home was even considered, so an owner of Kingdom Academy posting inside Grace
 * Community had their post attributed to Kingdom Academy. Identity is resolved
 * from the active Home's own membership row, or it is personal. There is no
 * third path.
 *
 * Callers persist the returned fields verbatim and never recompute them on read;
 * see `feedPost.publishedAsType` for why that immutability matters.
 */

/** The `content.manage` right is what "publishes as the organisation" means. */
function publishesAsHome(role: HomeRole | null | undefined): boolean {
  return homeRoleHasPermission(role, "content.manage")
}

export type PublishingIdentity =
  | {
      type: "home"
      /** The Home being published into. */
      homeId: string
      /** The organisation the content is attributed to. */
      organizationId: string
      /** Display name + handle of the ORGANISATION, not the person. */
      name: string
      handle: string
      /** Avatar/logo of the organisation. */
      image: string | null
      /** The author's role in this Home at publication time (audit trail). */
      role: HomeRole
    }
  | {
      type: "personal"
      /** The Home the content was published into, if any. Null in personal mode. */
      homeId: string | null
      name: string
      handle: string
      image: string | null
      /** The author's role in `homeId`, or null when acting outside any Home. */
      role: HomeRole | null
    }

/**
 * Resolves the publishing identity for the acting user in their active context.
 *
 * @param actor The signed-in user's own identity, used for the personal case.
 */
export async function resolvePublishingIdentity(actor: {
  name: string
  handle: string
  image: string | null
}): Promise<PublishingIdentity> {
  const { home, membership, mode } = await getActiveHomeContext()

  // Personal mode, or no Home at all: the person publishes as themselves and the
  // content belongs to no organisation.
  if (mode === "personal" || !home) {
    return { type: "personal", homeId: null, name: actor.name, handle: actor.handle, image: actor.image, role: null }
  }

  const role = (membership?.status === "active" ? membership.role : null) as HomeRole | null

  // A Home is active but the user is an ordinary member of THIS Home. They post
  // into the Home, under their own name. Their admin rights in other Homes are
  // irrelevant here and must not leak in.
  if (!publishesAsHome(role)) {
    return { type: "personal", homeId: home.id, name: actor.name, handle: actor.handle, image: actor.image, role }
  }

  // Admin of the active Home: publish as the organisation.
  const [org] = await db
    .select({ id: organization.id, name: organization.name, handle: organization.handle, logo: organization.logo })
    .from(organization)
    .where(eq(organization.id, home.organizationId))
    .limit(1)

  // Defensive: a Home without its organisation row is a broken invariant, but
  // falling back to personal is far safer than attributing to a phantom org.
  if (!org) {
    return { type: "personal", homeId: home.id, name: actor.name, handle: actor.handle, image: actor.image, role }
  }

  return {
    type: "home",
    homeId: home.id,
    organizationId: org.id,
    name: org.name,
    handle: org.handle,
    image: org.logo,
    role: role as HomeRole,
  }
}

/**
 * The columns to persist on a new post/article. Kept as one helper so every
 * create path stamps the identical shape and no surface can drift.
 */
export function publishingColumns(identity: PublishingIdentity) {
  return {
    homeId: identity.homeId,
    organizationId: identity.type === "home" ? identity.organizationId : null,
    publishedAsType: identity.type,
    publishedAsRole: identity.role,
  }
}

/**
 * Whether the acting user may publish organisational content in the currently
 * active Home. Scoped to that Home alone — administering another Home grants
 * nothing here.
 */
export async function canPublishAsActiveHome(): Promise<boolean> {
  const { home, membership, mode } = await getActiveHomeContext()
  if (mode === "personal" || !home) return false
  if (membership?.status !== "active") return false
  return publishesAsHome(membership.role as HomeRole)
}
