"use server"

import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { homeMembership, liveStream } from "@/lib/db/schema"
import { getOrganizationPosts, type OrgPostView } from "@/app/actions/organizations"
import { getOrganizationEvents, type EventView } from "@/app/actions/org-content"
import { getCommunityPosts, type CommunityPostView } from "@/app/actions/community"

// Home-scoped surfacing of existing Frequency systems. Rather than duplicate the
// Rooms/Live systems, we reuse the global `liveStream` table and scope it to the
// people who belong to THIS Home — a live session hosted by an active member of
// the organisation. This keeps Organisation A's private sessions invisible to
// Organisation B (the core privacy boundary) while reusing the premium Live
// experience. Deeper per-session scoping columns land in a later pass.

export type HomeLiveView = {
  id: number
  roomName: string
  hostName: string
  hostHandle: string
  title: string
  cover: string | null
  mode: "audio" | "video"
  layout: "podcast" | "conversation"
  topic: string | null
  startedAt: string
}

/** The user ids of every ACTIVE member of a Home. */
async function activeMemberIds(homeId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: homeMembership.userId })
    .from(homeMembership)
    .where(and(eq(homeMembership.homeId, homeId), eq(homeMembership.status, "active")))
  return rows.map((r) => r.userId)
}

function toLiveView(r: typeof liveStream.$inferSelect): HomeLiveView {
  return {
    id: r.id,
    roomName: r.roomName,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    cover: r.cover,
    mode: (r.mode as "audio" | "video") ?? "audio",
    layout: (r.layout as "podcast" | "conversation") ?? "podcast",
    topic: r.topic ?? null,
    startedAt: r.startedAt.toISOString(),
  }
}

/**
 * Currently-live sessions hosted by members of this Home. Split by shape so the
 * caller can present "Rooms" (conversation gatherings where everyone can speak)
 * separately from "Live" (podcast / video broadcasts).
 */
export async function getHomeLiveSessions(
  homeId: string,
): Promise<{ rooms: HomeLiveView[]; broadcasts: HomeLiveView[] }> {
  const memberIds = await activeMemberIds(homeId)
  if (memberIds.length === 0) return { rooms: [], broadcasts: [] }

  const rows = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.status, "live"), inArray(liveStream.hostId, memberIds)))
    .orderBy(desc(liveStream.startedAt))

  const rooms: HomeLiveView[] = []
  const broadcasts: HomeLiveView[] = []
  for (const r of rows) {
    const view = toLiveView(r)
    if (view.mode === "audio" && view.layout === "conversation") rooms.push(view)
    else broadcasts.push(view)
  }
  return { rooms, broadcasts }
}

export type HomeDashboardData = {
  latestPost: OrgPostView | null
  nextEvent: EventView | null
  liveNow: HomeLiveView | null
  recentCommunity: CommunityPostView | null
  counts: { upcomingEvents: number; liveNow: number }
}

/**
 * One guarded pass that assembles everything the Home dashboard surfaces, all
 * scoped to this organisation: its newest post (org voice), soonest upcoming
 * event, a session that's live right now, and the most recent Community Help
 * thread (member voice). Callers must have already verified Home membership.
 */
export async function getHomeDashboard(homeId: string, orgId: string): Promise<HomeDashboardData> {
  const [posts, events, live, community] = await Promise.all([
    getOrganizationPosts(orgId),
    getOrganizationEvents(orgId),
    getHomeLiveSessions(homeId),
    getCommunityPosts(homeId),
  ])

  const liveList = [...live.broadcasts, ...live.rooms]

  return {
    latestPost: posts[0] ?? null,
    nextEvent: events.upcoming[0] ?? null,
    liveNow: liveList[0] ?? null,
    recentCommunity: community[0] ?? null,
    counts: { upcomingEvents: events.upcoming.length, liveNow: liveList.length },
  }
}
