"use server"

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  announcement,
  announcementInteraction,
  catalogueItem,
  chatroom,
  chatroomJoinRequest,
  chatroomMember,
  chatroomMessage,
  communityComment,
  communityPost,
  contentView,
  devotional,
  episode,
  episodeComment,
  event,
  eventRsvp,
  feedComment,
  feedPost,
  home,
  homeAppointment,
  homeAuthKey,
  homeBooking,
  homeMembership,
  liveBlocked,
  liveCallRequest,
  liveChatMessage,
  liveNote,
  livePresence,
  liveReaction,
  liveStream,
  notification,
  organization,
  repost,
  subscription,
  user as userTable,
} from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { createOrganization, updateOrganization } from "@/app/actions/organizations"
import { getHomeByHandle, getMyHomes, getViewerMembership } from "@/lib/home/access"
import { ACTIVE_HOME_COOKIE } from "@/lib/home/active-home"
import { DEFAULT_HOME_ACCENT } from "@/lib/home/accent"
import { isValidKeyFormat, normalizeKey } from "@/lib/home/auth-key"
import { ensureHomeForOrg, insertFreshKey } from "@/lib/home/provision"
import { isHomePlanId, type HomePlanId } from "@/lib/home/plans"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import { getHomeOrgType } from "@/lib/home/org-types"
import { orgCategoryLabel, type OrgSocials } from "@/lib/org-types"
import type {
  HomeAuthKeyView,
  HomeJoinPolicy,
  HomeMemberRow,
  HomeMembershipStatus,
  HomeView,
} from "@/lib/home/types"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/** Loads a Home by handle and asserts the caller holds a management permission. */
async function requireHomeManager(handle: string, permission: Parameters<typeof homeRoleHasPermission>[1]) {
  const user = await requireUser()
  const homeView = await getHomeByHandle(handle)
  if (!homeView) throw new Error("Home not found.")
  const membership = await getViewerMembership(homeView.id)
  if (!membership || membership.status !== "active" || !homeRoleHasPermission(membership.role, permission)) {
    throw new Error("You don't have permission to do that.")
  }
  return { user, home: homeView, membership }
}

export type CreateHomeInput = {
  orgName: string
  orgTypeId: string
  categoryOther?: string
  country?: string
  region?: string
  city?: string
  website?: string
  description?: string
  logo?: string
  cover?: string
  accentColor?: string
  plan: HomePlanId
  joinPolicy?: HomeJoinPolicy
  contactEmail?: string
  contactPhone?: string
  socials?: OrgSocials
  mission?: string
  vision?: string
  history?: string
  beliefs?: string
}

/**
 * Creates (or links) the caller's organisation and provisions its Frequency
 * Home in one step. The caller becomes the Home Owner. Idempotent: if the
 * organisation already has a Home, returns it rather than duplicating.
 * Must run with an authenticated session (established during onboarding).
 */
export async function createHome(input: CreateHomeInput): Promise<{ handle: string }> {
  const user = await requireUser()

  const name = input.orgName.trim()
  if (!name) throw new Error("Organisation name is required.")
  const plan: HomePlanId = isHomePlanId(input.plan) ? input.plan : "premium"
  const type = getHomeOrgType(input.orgTypeId)
  const categoryOther =
    type.category === "other" ? input.categoryOther?.trim() || type.categoryOther || "Organisation" : undefined

  // 1) Create/link the public organisation (also flips accountType). Reuses the
  //    existing org system so discovery, profile and catalogue all work. If this
  //    admin already owns an organisation, this is an ADDITIONAL Home on the same
  //    account — force a brand-new organisation rather than reusing the first, so
  //    one login can administer several Homes (no second email/password).
  const alreadyOwns = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.ownerId, user.id))
    .limit(1)
  const { handle } = await createOrganization({
    name,
    category: type.category,
    categoryOther,
    forceNew: alreadyOwns.length > 0,
    description: input.description,
    logo: input.logo,
    reach: input.country ? "local" : "online_only",
    onlineOnly: !input.country,
    country: input.country,
    region: input.region,
    city: input.city,
    website: input.website,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    socials: input.socials,
    mission: input.mission,
    vision: input.vision,
    history: input.history,
    beliefs: input.beliefs,
  })

  const orgRows = await db.select().from(organization).where(eq(organization.handle, handle)).limit(1)
  const org = orgRows[0]
  if (!org) throw new Error("Could not resolve your organisation. Please try again.")

  // 2) Apply optional branding the org create step doesn't cover (cover image).
  if (input.cover) {
    await updateOrganization(org.id, { cover: input.cover })
  }

  // 3) Provision the Home via the shared, idempotent helper: home row, Owner
  //    membership for the registering administrator, and the first
  //    Organisation Authorisation Key. Passing the onboarding plan/accent also
  //    syncs them if the org already had a Home from another creation path.
  await ensureHomeForOrg({
    org: { id: org.id, name, ownerId: user.id },
    plan,
    accentColor: input.accentColor || null,
    joinPolicy: input.joinPolicy ?? "auto",
  })

  // Make the brand-new Home the caller's active context immediately, so they
  // land inside it rather than needing to pick it from My Homes.
  const store = await cookies()
  store.set(ACTIVE_HOME_COOKIE, handle, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })

  revalidatePath("/", "layout")
  return { handle }
}

export type MyHomeLink = {
  handle: string
  name: string
  logo: string | null
  initials: string
  accent: string
  role: HomeRole
  memberCount: number
  isActive: boolean
}

/**
 * The Homes the current viewer actively belongs to, for the "My Homes" switcher
 * in the navigation drawer. Each row carries the viewer's role in that Home and
 * whether it is the currently active context, so the menu can badge "Admin" vs
 * "Member" and mark the active Home. Client-callable wrapper over the
 * `server-only` access helpers.
 */
export async function getMyHomeMemberships(): Promise<MyHomeLink[]> {
  const homes = await getMyHomes()
  const store = await cookies()
  const activeHandle = store.get(ACTIVE_HOME_COOKIE)?.value
  const activeResolved = activeHandle && homes.some((h) => h.handle === activeHandle) ? activeHandle : homes[0]?.handle

  const rows = await Promise.all(
    homes.map(async (h) => {
      const membership = await getViewerMembership(h.id)
      return {
        handle: h.handle,
        name: h.name,
        logo: h.orgLogo,
        initials: h.orgInitials,
        accent: h.accentColor || DEFAULT_HOME_ACCENT,
        role: (membership?.role ?? "member") as HomeRole,
        memberCount: h.memberCount,
        isActive: h.handle === activeResolved,
      }
    }),
  )
  return rows
}

/**
 * Sets the viewer's active Home context. Only Homes the viewer is an ACTIVE
 * member of can be activated — a foreign/invalid handle is rejected so the
 * cookie can never point at another organisation's Home. Returns the handle so
 * the client can route into it.
 */
export async function setActiveHome(handle: string): Promise<{ handle: string }> {
  await requireUser()
  const homes = await getMyHomes()
  const target = homes.find((h) => h.handle === handle)
  if (!target) throw new Error("You're not a member of that Home.")
  const store = await cookies()
  store.set(ACTIVE_HOME_COOKIE, handle, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  revalidatePath("/", "layout")
  return { handle }
}

export type HomeKeyPreview = {
  handle: string
  homeName: string
  orgInitials: string
  orgColor: string
  orgLogo: string | null
  categoryLabel: string
  accent: string
}

/**
 * Validates an authorisation key WITHOUT joining and returns the organisation's
 * identity, so the join flow can confirm "You are joining this Home" before the
 * user commits to creating an account (spec §5). Throws a clear error when the
 * key is unrecognised or no longer active. Safe to call unauthenticated — it
 * only reveals public organisation branding, never private content.
 */
export async function previewHomeByKey(rawKey: string): Promise<HomeKeyPreview> {
  const key = normalizeKey(rawKey)
  if (!isValidKeyFormat(key)) {
    throw new Error("That Home key isn't recognised. Check it and try again.")
  }
  const keyRows = await db
    .select()
    .from(homeAuthKey)
    .where(and(eq(homeAuthKey.key, key), eq(homeAuthKey.active, true)))
    .limit(1)
  if (keyRows.length === 0) {
    throw new Error("That Home key isn't recognised or is no longer active.")
  }
  const rows = await db
    .select({ h: home, org: organization })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(eq(home.id, keyRows[0].homeId))
    .limit(1)
  if (rows.length === 0) throw new Error("This Home is no longer available.")
  const { h, org } = rows[0]
  return {
    handle: org.handle,
    homeName: h.name,
    orgInitials: getInitials(org.name),
    orgColor: getAvatarColor(org.id),
    orgLogo: org.logo,
    categoryLabel: orgCategoryLabel(org.category, org.categoryOther),
    accent: h.accentColor || DEFAULT_HOME_ACCENT,
  }
}

export type JoinHomeResult =
  | { status: "joined"; handle: string; homeName: string }
  | { status: "pending"; handle: string; homeName: string }
  | { status: "already_member"; handle: string; homeName: string }

/** An individual joins a Home by entering its authorisation key. */
export async function joinHomeByKey(rawKey: string): Promise<JoinHomeResult> {
  const user = await requireUser()
  const key = normalizeKey(rawKey)
  if (!isValidKeyFormat(key)) throw new Error("That doesn't look like a valid authorisation key.")

  const keyRows = await db
    .select()
    .from(homeAuthKey)
    .where(and(eq(homeAuthKey.key, key), eq(homeAuthKey.active, true)))
    .limit(1)
  if (keyRows.length === 0) {
    throw new Error("That key is invalid or no longer active. Ask your organisation for a current key.")
  }
  const homeId = keyRows[0].homeId

  const homeRows = await db
    .select({ h: home, org: organization })
    .from(home)
    .innerJoin(organization, eq(organization.id, home.organizationId))
    .where(eq(home.id, homeId))
    .limit(1)
  if (homeRows.length === 0) throw new Error("This Home is no longer available.")
  const { h, org } = homeRows[0]

  // Already a member? Report status so the UI can route appropriately.
  const existing = await db
    .select()
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.userId, user.id)))
    .limit(1)
  if (existing.length > 0) {
    const status = existing[0].status === "pending" ? "pending" : "already_member"
    return { status, handle: org.handle, homeName: h.name }
  }

  const autoJoin = h.joinPolicy === "auto"
  await db.insert(homeMembership).values({
    id: crypto.randomUUID(),
    homeId,
    userId: user.id,
    role: "member",
    status: autoJoin ? "active" : "pending",
    joinedVia: autoJoin ? "key_auto" : "key_request",
  })

  // A member who joined a specific Home has completed onboarding — they chose
  // their Home directly and must never be diverted to the ministries "Welcome"
  // subscribe screen. Stamp onboardedAt if it isn't already set.
  await db
    .update(userTable)
    .set({ onboardedAt: new Date() })
    .where(and(eq(userTable.id, user.id), isNull(userTable.onboardedAt)))

  // On an immediate (auto) join, switch the viewer's active context into the
  // Home they just joined so they land straight inside it.
  if (autoJoin) {
    const store = await cookies()
    store.set(ACTIVE_HOME_COOKIE, org.handle, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  }

  revalidatePath("/", "layout")
  return { status: autoJoin ? "joined" : "pending", handle: org.handle, homeName: h.name }
}

/** Owner/admin sets whether a valid key auto-joins or requires approval. */
export async function setJoinPolicy(handle: string, joinPolicy: HomeJoinPolicy) {
  const { home: homeView } = await requireHomeManager(handle, "home.manage")
  await db.update(home).set({ joinPolicy, updatedAt: new Date() }).where(eq(home.id, homeView.id))
  revalidatePath(`/org/${handle}/admin/members`)
  return { joinPolicy }
}

/**
 * Regenerates the authorisation key: marks the current active key inactive and
 * inserts a new one. Existing members are NEVER affected — only future joins.
 */
export async function regenerateAuthKey(handle: string): Promise<{ key: string }> {
  const { user, home: homeView } = await requireHomeManager(handle, "authkey.manage")
  await db
    .update(homeAuthKey)
    .set({ active: false, disabledAt: new Date() })
    .where(and(eq(homeAuthKey.homeId, homeView.id), eq(homeAuthKey.active, true)))
  const key = await insertFreshKey(homeView.id, homeView.orgName, user.id)
  revalidatePath(`/org/${handle}/admin/members`)
  return { key }
}

/** Disables the current active key without issuing a new one (closes joins). */
export async function disableAuthKey(handle: string) {
  const { home: homeView } = await requireHomeManager(handle, "authkey.manage")
  await db
    .update(homeAuthKey)
    .set({ active: false, disabledAt: new Date() })
    .where(and(eq(homeAuthKey.homeId, homeView.id), eq(homeAuthKey.active, true)))
  revalidatePath(`/org/${handle}/admin/members`)
  return { ok: true }
}

/** Returns the current active key for admin display (view/copy). */
export async function getActiveAuthKey(handle: string): Promise<HomeAuthKeyView | null> {
  const { home: homeView } = await requireHomeManager(handle, "authkey.manage")
  const rows = await db
    .select()
    .from(homeAuthKey)
    .where(and(eq(homeAuthKey.homeId, homeView.id), eq(homeAuthKey.active, true)))
    .orderBy(desc(homeAuthKey.createdAt))
    .limit(1)
  if (rows.length === 0) return null
  return { id: rows[0].id, key: rows[0].key, active: rows[0].active, createdAt: rows[0].createdAt.toISOString() }
}

/** Full member list for the admin Members table. */
export async function getHomeMembers(handle: string): Promise<HomeMemberRow[]> {
  const { user, home: homeView } = await requireHomeManager(handle, "members.view")
  const rows = await db
    .select({ m: homeMembership, u: userTable })
    .from(homeMembership)
    .innerJoin(userTable, eq(userTable.id, homeMembership.userId))
    .where(eq(homeMembership.homeId, homeView.id))
    .orderBy(desc(homeMembership.createdAt))
  return rows.map(({ m, u }) => ({
    id: m.id,
    userId: m.userId,
    name: u.name,
    email: u.email,
    image: u.image,
    initials: getInitials(u.name),
    color: getAvatarColor(u.id),
    role: m.role as HomeRole,
    status: m.status as HomeMembershipStatus,
    joinedVia: m.joinedVia,
    joinedAt: m.createdAt.toISOString(),
    isViewer: m.userId === user.id,
  }))
}

/** Approve a pending member (approval join policy). */
export async function approveMember(handle: string, membershipId: string) {
  const { home: homeView } = await requireHomeManager(handle, "members.manage")
  await db
    .update(homeMembership)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(homeMembership.id, membershipId), eq(homeMembership.homeId, homeView.id)))
  revalidatePath(`/org/${handle}/admin/members`)
  return { ok: true }
}

/** Remove a member. The Owner cannot be removed. */
export async function removeMember(handle: string, membershipId: string) {
  const { home: homeView } = await requireHomeManager(handle, "members.manage")
  const rows = await db
    .select()
    .from(homeMembership)
    .where(and(eq(homeMembership.id, membershipId), eq(homeMembership.homeId, homeView.id)))
    .limit(1)
  if (rows.length === 0) return { ok: true }
  if (rows[0].role === "owner") throw new Error("The Home owner cannot be removed.")
  await db.delete(homeMembership).where(eq(homeMembership.id, membershipId))
  revalidatePath(`/org/${handle}/admin/members`)
  return { ok: true }
}

/**
 * The current viewer leaves a Home they belong to. Self-service (no management
 * permission needed) but the Owner can never leave — ownership is transferred or
 * the Home is deleted elsewhere, not abandoned. If the departed Home was the
 * active context, the cookie is cleared so the app falls back to another Home.
 */
export async function leaveHome(handle: string): Promise<{ ok: true }> {
  const user = await requireUser()
  const homeView = await getHomeByHandle(handle)
  if (!homeView) throw new Error("Home not found.")
  const membership = await getViewerMembership(homeView.id)
  if (!membership) throw new Error("You're not a member of that Home.")
  if (membership.role === "owner") {
    throw new Error("As the owner you can't leave your own Home.")
  }
  await db
    .delete(homeMembership)
    .where(and(eq(homeMembership.homeId, homeView.id), eq(homeMembership.userId, user.id)))

  // If we just left the active Home, drop the cookie so the app doesn't keep
  // pointing at a Home the viewer no longer belongs to.
  const store = await cookies()
  if (store.get(ACTIVE_HOME_COOKIE)?.value === handle) {
    store.delete(ACTIVE_HOME_COOKIE)
  }
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Permanently deletes a Home, its linked organisation/public profile, and all
 * content published under it. **Owner-only and irreversible.**
 *
 * The database defines no `ON DELETE CASCADE` for `home`/`organization` (the
 * only cascades live in Better Auth's own `neon_auth` schema), so every child
 * row has to be removed explicitly here — otherwise deleting a Home would
 * silently orphan episodes, chat messages, RSVPs and so on across ~20 tables.
 *
 * Deletion runs children-before-parents inside one transaction, so a failure
 * anywhere rolls the whole thing back rather than leaving a half-deleted Home.
 * Live-room tables (chat/presence/reactions/requests/blocks) key off the
 * stream's `roomName` rather than an id, so those are resolved first.
 */
export async function deleteHome(handle: string): Promise<{ ok: true }> {
  const user = await requireUser()
  const homeView = await getHomeByHandle(handle)
  if (!homeView) throw new Error("Home not found.")
  const membership = await getViewerMembership(homeView.id)
  // Owner-only: admins can manage a Home but must never be able to destroy it.
  if (!membership || membership.status !== "active" || membership.role !== "owner") {
    throw new Error("Only the Home owner can delete it.")
  }

  const homeId = homeView.id
  const orgId = homeView.organizationId

  await db.transaction(async (tx) => {
    // --- Resolve the ids/room names of everything scoped to this Home --------
    const streams = await tx.select().from(liveStream).where(eq(liveStream.homeId, homeId))
    const roomNames = streams.map((s) => s.roomName)
    const streamIds = streams.map((s) => s.id)

    const episodeIds = (await tx.select({ id: episode.id }).from(episode).where(eq(episode.homeId, homeId))).map(
      (r) => r.id,
    )
    const chatroomIds = (await tx.select({ id: chatroom.id }).from(chatroom).where(eq(chatroom.homeId, homeId))).map(
      (r) => r.id,
    )
    const communityPostIds = (
      await tx.select({ id: communityPost.id }).from(communityPost).where(eq(communityPost.homeId, homeId))
    ).map((r) => r.id)
    // Feed posts and announcements can be tagged by either key, so match both.
    const feedPostIds = (
      await tx
        .select({ id: feedPost.id })
        .from(feedPost)
        .where(orgId ? or(eq(feedPost.homeId, homeId), eq(feedPost.organizationId, orgId)) : eq(feedPost.homeId, homeId))
    ).map((r) => r.id)
    const announcementIds = (
      await tx
        .select({ id: announcement.id })
        .from(announcement)
        .where(
          orgId
            ? or(eq(announcement.homeId, homeId), eq(announcement.organizationId, orgId))
            : eq(announcement.homeId, homeId),
        )
    ).map((r) => r.id)

    // --- Live rooms (children keyed by roomName / streamId) -----------------
    if (roomNames.length > 0) {
      await tx.delete(liveChatMessage).where(inArray(liveChatMessage.roomName, roomNames))
      await tx.delete(livePresence).where(inArray(livePresence.roomName, roomNames))
      await tx.delete(liveReaction).where(inArray(liveReaction.roomName, roomNames))
      await tx.delete(liveCallRequest).where(inArray(liveCallRequest.roomName, roomNames))
      await tx.delete(liveBlocked).where(inArray(liveBlocked.roomName, roomNames))
    }
    if (streamIds.length > 0) await tx.delete(liveNote).where(inArray(liveNote.streamId, streamIds))
    await tx.delete(liveStream).where(eq(liveStream.homeId, homeId))

    // --- Episodes (incl. live replays) --------------------------------------
    if (episodeIds.length > 0) {
      await tx.delete(episodeComment).where(inArray(episodeComment.episodeId, episodeIds))
      await tx.delete(contentView).where(inArray(contentView.episodeId, episodeIds))
    }
    await tx.delete(episode).where(eq(episode.homeId, homeId))

    // --- Chatrooms ----------------------------------------------------------
    if (chatroomIds.length > 0) {
      await tx.delete(chatroomMessage).where(inArray(chatroomMessage.chatroomId, chatroomIds))
      await tx.delete(chatroomMember).where(inArray(chatroomMember.chatroomId, chatroomIds))
      await tx.delete(chatroomJoinRequest).where(inArray(chatroomJoinRequest.chatroomId, chatroomIds))
    }
    await tx.delete(chatroom).where(eq(chatroom.homeId, homeId))

    // --- Feed / community / announcements -----------------------------------
    if (feedPostIds.length > 0) {
      await tx.delete(feedComment).where(inArray(feedComment.postId, feedPostIds))
      await tx.delete(repost).where(inArray(repost.postId, feedPostIds))
      await tx.delete(feedPost).where(inArray(feedPost.id, feedPostIds))
    }
    if (communityPostIds.length > 0) {
      await tx.delete(communityComment).where(inArray(communityComment.postId, communityPostIds))
      await tx.delete(communityPost).where(inArray(communityPost.id, communityPostIds))
    }
    if (announcementIds.length > 0) {
      await tx.delete(eventRsvp).where(inArray(eventRsvp.announcementId, announcementIds))
      await tx.delete(announcementInteraction).where(inArray(announcementInteraction.announcementId, announcementIds))
      await tx.delete(announcement).where(inArray(announcement.id, announcementIds))
    }

    // --- Remaining Home-scoped rows ----------------------------------------
    await tx.delete(devotional).where(eq(devotional.homeId, homeId))
    await tx.delete(notification).where(eq(notification.homeId, homeId))
    await tx.delete(homeBooking).where(eq(homeBooking.homeId, homeId))
    await tx.delete(homeAppointment).where(eq(homeAppointment.homeId, homeId))
    await tx.delete(homeAuthKey).where(eq(homeAuthKey.homeId, homeId))
    await tx.delete(homeMembership).where(eq(homeMembership.homeId, homeId))

    // --- Organisation-scoped rows, then the Home + org themselves -----------
    if (orgId) {
      await tx.delete(catalogueItem).where(eq(catalogueItem.organizationId, orgId))
      await tx.delete(event).where(eq(event.organizationId, orgId))
      await tx.delete(subscription).where(eq(subscription.organizationId, orgId))
    }
    await tx.delete(home).where(eq(home.id, homeId))
    if (orgId) await tx.delete(organization).where(eq(organization.id, orgId))
  })

  // The deleted Home can't remain the active context.
  const store = await cookies()
  if (store.get(ACTIVE_HOME_COOKIE)?.value === handle) {
    store.delete(ACTIVE_HOME_COOKIE)
  }
  revalidatePath("/", "layout")
  return { ok: true }
}

/** Change a member's role. Ownership cannot be assigned or removed here. */
export async function updateMemberRole(handle: string, membershipId: string, role: HomeRole) {
  const { home: homeView } = await requireHomeManager(handle, "members.manage")
  if (role === "owner") throw new Error("Ownership can't be assigned from here.")
  const rows = await db
    .select()
    .from(homeMembership)
    .where(and(eq(homeMembership.id, membershipId), eq(homeMembership.homeId, homeView.id)))
    .limit(1)
  if (rows.length === 0) throw new Error("Member not found.")
  if (rows[0].role === "owner") throw new Error("The owner's role can't be changed.")
  await db
    .update(homeMembership)
    .set({ role, updatedAt: new Date() })
    .where(eq(homeMembership.id, membershipId))
  revalidatePath(`/org/${handle}/admin/members`)
  return { ok: true }
}

/** Update Home branding (accent colour) + linked organisation logo/cover. */
export async function updateHomeBranding(
  handle: string,
  input: { accentColor?: string | null; logo?: string | null; cover?: string | null },
) {
  const { home: homeView } = await requireHomeManager(handle, "home.manage")
  if (input.accentColor !== undefined) {
    await db.update(home).set({ accentColor: input.accentColor, updatedAt: new Date() }).where(eq(home.id, homeView.id))
  }
  const orgPatch: { logo?: string | null; cover?: string | null } = {}
  if (input.logo !== undefined) orgPatch.logo = input.logo
  if (input.cover !== undefined) orgPatch.cover = input.cover
  if (Object.keys(orgPatch).length > 0) {
    await updateOrganization(homeView.organizationId, orgPatch)
  }
  // The Home IS the main interface, served at "/". Revalidate it plus the
  // admin settings page so branding/accent changes show immediately.
  revalidatePath("/")
  revalidatePath(`/org/${handle}/admin/settings`)
  return { ok: true }
}

/** Change the Home's subscription plan. */
export async function changePlan(handle: string, plan: HomePlanId) {
  const { home: homeView } = await requireHomeManager(handle, "subscription.manage")
  if (!isHomePlanId(plan)) throw new Error("Unknown plan.")
  await db.update(home).set({ plan, updatedAt: new Date() }).where(eq(home.id, homeView.id))
  revalidatePath(`/org/${handle}/admin/subscription`)
  return { plan }
}

/** Aggregated data for the admin Overview page. */
export async function getHomeAdminOverview(handle: string): Promise<{
  home: HomeView
  memberCount: number
  pendingCount: number
  adminCount: number
}> {
  const { home: homeView } = await requireHomeManager(handle, "members.view")
  const all = await db.select().from(homeMembership).where(eq(homeMembership.homeId, homeView.id))
  const memberCount = all.filter((m) => m.status === "active").length
  const pendingCount = all.filter((m) => m.status === "pending").length
  const adminCount = all.filter((m) => m.status === "active" && m.role !== "member").length
  return { home: homeView, memberCount, pendingCount, adminCount }
}
