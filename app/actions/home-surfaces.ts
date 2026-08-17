"use server"

import { and, desc, eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { liveStream } from "@/lib/db/schema"
import { getHomeByHandle, isActiveHomeMember, HOME_GO_LIVE_COOKIE } from "@/lib/home/access"
import { getOrganizationPosts, type OrgPostView } from "@/app/actions/organizations"
import { getOrganizationEvents, type EventView } from "@/app/actions/org-content"
import { getCommunityPosts, type CommunityPostView } from "@/app/actions/community"

// Home-scoped surfacing of existing Frequency systems. Rather than duplicate the
// Rooms/Live systems, we reuse the global `liveStream` table and scope it with an
// explicit `homeId`: a session started from within a Home is stamped with that
// Home, so it appears ONLY here and never in Universal discovery. This is the
// core privacy boundary — Organisation A's private sessions are invisible to
// Organisation B — while reusing the premium Live experience end to end.

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
 * Currently-live sessions that belong to THIS Home — i.e. sessions explicitly
 * stamped with its `homeId` on go-live. Split by shape so the caller can present
 * "Rooms" (conversation gatherings where everyone can speak) separately from
 * "Live" (podcast / video broadcasts). Because we filter on the exact `homeId`,
 * one organisation's private sessions can never surface in another's.
 */
export async function getHomeLiveSessions(
  homeId: string,
): Promise<{ rooms: HomeLiveView[]; broadcasts: HomeLiveView[] }> {
  const rows = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.status, "live"), eq(liveStream.homeId, homeId)))
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

/**
 * Entry point for starting a live session from INSIDE a Home. Validates that the
 * caller is an active member, then drops a short-lived cookie carrying the
 * Home's id and returns the URL of the existing global go-live composer. When
 * the member finishes setup and goes live, `startBroadcast` reads that cookie
 * and stamps the new session's `homeId` — so the whole premium composer is
 * reused untouched, and the session lands scoped to this Home.
 */
export async function beginHomeGoLive(input: {
  handle: string
  kind: "room" | "audio" | "video"
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false, error: "Please sign in first." }

  const home = await getHomeByHandle(input.handle)
  if (!home) return { ok: false, error: "This home no longer exists." }

  const isMember = await isActiveHomeMember(home.id, session.user.id)
  if (!isMember) return { ok: false, error: "Only members of this home can start a session here." }

  const jar = await cookies()
  jar.set(HOME_GO_LIVE_COOKIE, home.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 30, // 30 minutes — ample time to configure and go live
  })

  const url =
    input.kind === "video"
      ? "/studio?mode=video"
      : input.kind === "room"
        ? "/studio?mode=audio&layout=conversation"
        : "/studio?mode=audio"
  return { ok: true, url }
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
