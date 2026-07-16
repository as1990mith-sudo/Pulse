"use server"

import { and, asc, desc, eq, gt, lt } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { liveStream, liveChatMessage, liveCallRequest, liveReaction, livePresence, liveBlocked } from "@/lib/db/schema"
import { getHandle, getAvatarColor, getInitials } from "@/lib/identity"
import {
  createAccessToken,
  isLiveKitConfigured,
  LIVEKIT_URL,
  setParticipantPublish,
  removeParticipant,
  muteParticipantAudio,
} from "@/lib/livekit"
import { notifyFollowers, notifyUser } from "@/app/actions/notifications"

// Host + up to 11 guests = 12 on stage.
const MAX_GUESTS = 11

// A live stream whose host hasn't sent a heartbeat in this long is considered
// abandoned (closed tab, lost connection, killed app) and is auto-ended. The
// host pings every ~20s, so this tolerates a couple of missed beats + reconnect.
const STALE_AFTER_MS = 60_000

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/**
 * Marks any "live" streams with a stale heartbeat as ended. Cheap single UPDATE
 * run at the top of every read path so abandoned streams never linger as live
 * (which is what previously stranded a dropped host and orphaned the row).
 */
async function endStaleStreams(): Promise<void> {
  await db
    .update(liveStream)
    .set({ status: "ended", endedAt: new Date() })
    .where(and(eq(liveStream.status, "live"), lt(liveStream.lastSeenAt, new Date(Date.now() - STALE_AFTER_MS))))
}

/**
 * Host heartbeat — keeps the host's live stream marked active. Returns
 * `ended:true` if the stream is no longer live (e.g. it was already cleaned up
 * or ended elsewhere), which tells the client to stop and finalize.
 */
export async function heartbeatBroadcast(input: { roomName: string }): Promise<{ ok: boolean; ended: boolean }> {
  const user = await requireUser()
  const rows = await db
    .update(liveStream)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.hostId, user.id), eq(liveStream.status, "live")))
    .returning({ id: liveStream.id })
  return { ok: true, ended: rows.length === 0 }
}

export type LiveMode = "audio" | "video"
export type LiveVisibility = "public" | "private"
// Video layout the host broadcasts in. Only meaningful when mode === "video".
export type LiveOrientation = "portrait" | "landscape"

export type LiveStreamView = {
  id: number
  roomName: string
  hostId: string
  hostName: string
  hostHandle: string
  title: string
  category: string | null
  cover: string | null
  mode: LiveMode
  orientation: LiveOrientation
  visibility: LiveVisibility
  locked?: boolean
  pinnedChatId?: number | null
  chatBgUrl?: string | null
  chatBgEffect?: ChatBgEffect
  theme?: string
  startedAt: string
}

export type GoLiveResult =
  | { ok: true; token: string; serverUrl: string; roomName: string }
  | { ok: false; error: string }

export type JoinResult =
  | { ok: true; token: string; serverUrl: string; roomName: string; canPublish: boolean }
  | { ok: false; error: string }

/** Host starts broadcasting: creates the stream row, mints a publisher token, notifies followers. */
export async function startBroadcast(input: {
  title: string
  category?: string
  cover?: string | null
  mode?: LiveMode
  orientation?: LiveOrientation
  visibility?: LiveVisibility
}): Promise<GoLiveResult> {
  const user = await requireUser()
  if (!isLiveKitConfigured()) {
    return { ok: false, error: "Live is not configured yet. Add your LiveKit credentials to start broadcasting." }
  }
  const mode: LiveMode = input.mode === "video" ? "video" : "audio"
  // Cover artwork is required for audio live sessions (there's no video feed to
  // represent the room, so the cover is what listeners see).
  if (mode === "audio" && !input.cover) {
    return { ok: false, error: "Cover artwork is required for audio live sessions." }
  }
  // Orientation only applies to video; audio is always stored as "portrait".
  const orientation: LiveOrientation = mode === "video" && input.orientation === "landscape" ? "landscape" : "portrait"
  const visibility: LiveVisibility = input.visibility === "private" ? "private" : "public"

  const title = input.title.trim() || `${user.name} — live`
  // Deterministic, unique room name per host session.
  const roomName = `live_${user.id}_${Date.now()}`

  // End any stale streams this host may have left open.
  await db
    .update(liveStream)
    .set({ status: "ended", endedAt: new Date() })
    .where(and(eq(liveStream.hostId, user.id), eq(liveStream.status, "live")))

  await db.insert(liveStream).values({
    roomName,
    hostId: user.id,
    hostName: user.name,
    hostHandle: getHandle(user.name),
    title,
    category: input.category?.trim() || null,
    cover: input.cover ?? null,
    mode,
    orientation,
    visibility,
    status: "live",
  })

  const token = await createAccessToken({
    roomName,
    identity: user.id,
    name: user.name,
    canPublish: true,
    metadata: JSON.stringify({ image: user.image ?? null }),
  })

  // Let followers know they're on air.
  await notifyFollowers({
    actorId: user.id,
    actorName: user.name,
    type: "live",
    message: title,
    link: `/live/${roomName}`,
  })

  revalidatePath("/live")
  return { ok: true, token, serverUrl: LIVEKIT_URL, roomName }
}

/** Host stops broadcasting. */
export async function endBroadcast(input: { roomName: string }): Promise<void> {
  const user = await requireUser()
  await db
    .update(liveStream)
    .set({ status: "ended", endedAt: new Date() })
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.hostId, user.id)))
  revalidatePath("/live")
}

/** A listener (or the host returning) joins an existing live room. */
export async function joinBroadcast(input: { roomName: string }): Promise<JoinResult> {
  const user = await requireUser()
  if (!isLiveKitConfigured()) {
    return { ok: false, error: "Live audio is not configured yet." }
  }

  // Clean up abandoned streams before deciding whether this room is still live.
  await endStaleStreams()

  const [stream] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))

  if (!stream) return { ok: false, error: "This stream has ended." }

  const isHost = stream.hostId === user.id

  // Blocked users can't (re)join. The host is never blockable, so this only
  // affects listeners/guests the host removed.
  if (!isHost) {
    const [blocked] = await db
      .select({ id: liveBlocked.id })
      .from(liveBlocked)
      .where(and(eq(liveBlocked.roomName, input.roomName), eq(liveBlocked.userId, user.id)))
      .limit(1)
    if (blocked) return { ok: false, error: "You can no longer join this live." }
  }

  // A host rejoining (e.g. recovering from a dropped connection) refreshes the
  // heartbeat right away so the in-flight reconnect isn't swept as stale.
  if (isHost) {
    await db
      .update(liveStream)
      .set({ lastSeenAt: new Date() })
      .where(eq(liveStream.roomName, input.roomName))
  }
  // Grid video streams are Meet/Zoom-style meetings: every participant gets a
  // tile and publishes their own camera + mic. Everyone else (audio rooms, or
  // Focused/portrait video) keeps the broadcast model where only the host (and
  // invited guests) may publish.
  const isGridMeeting = stream.mode === "video" && (stream.orientation ?? "portrait") === "landscape"
  const canPublish = isHost || isGridMeeting

  const token = await createAccessToken({
    roomName: input.roomName,
    identity: user.id,
    name: user.name,
    canPublish,
    metadata: JSON.stringify({ image: user.image ?? null }),
  })

  return { ok: true, token, serverUrl: LIVEKIT_URL, roomName: input.roomName, canPublish }
}

/** All currently-live streams, newest first. */
export async function getLiveStreams(): Promise<LiveStreamView[]> {
  await endStaleStreams()
  const rows = await db
    .select()
    .from(liveStream)
    // Only public streams are listed in discovery; private streams stay unlisted.
    .where(and(eq(liveStream.status, "live"), eq(liveStream.visibility, "public")))
    .orderBy(desc(liveStream.startedAt))

  return rows.map((r) => ({
    id: r.id,
    roomName: r.roomName,
    hostId: r.hostId,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    category: r.category,
    cover: r.cover,
    mode: (r.mode as LiveMode) ?? "audio",
    orientation: (r.orientation as LiveOrientation) ?? "portrait",
    visibility: (r.visibility as LiveVisibility) ?? "public",
    startedAt: r.startedAt.toISOString(),
  }))
}

export type LiveChatMessageView = {
  id: number
  userId: string
  userName: string
  userImage: string | null
  isHost: boolean
  kind: "message" | "system"
  body: string
}

/** Posts a chat message to a live room. */
export async function sendLiveChat(input: { roomName: string; body: string }): Promise<void> {
  const user = await requireUser()
  const body = input.body.trim()
  if (!body) return

  const [stream] = await db
    .select({ hostId: liveStream.hostId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))

  await db.insert(liveChatMessage).values({
    roomName: input.roomName,
    userId: user.id,
    userName: user.name,
    userImage: user.image ?? null,
    isHost: stream?.hostId === user.id,
    kind: "message",
    body,
  })
}

/** Fetches chat messages for a room, optionally only those after `afterId` (for polling). */
export async function getLiveChat(input: { roomName: string; afterId?: number }): Promise<LiveChatMessageView[]> {
  const rows = await db
    .select()
    .from(liveChatMessage)
    .where(
      input.afterId
        ? and(eq(liveChatMessage.roomName, input.roomName), gt(liveChatMessage.id, input.afterId))
        : eq(liveChatMessage.roomName, input.roomName),
    )
    .orderBy(asc(liveChatMessage.id))
    .limit(100)

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userImage: r.userImage ?? null,
    isHost: r.isHost,
    kind: (r.kind as "message" | "system") ?? "message",
    body: r.body,
  }))
}

// --- Live presence (audience count + names, "entered the room" notices) -----

export type LiveAudienceMember = {
  userId: string
  userName: string
  userImage: string | null
  isHost: boolean
}

// Presence rows older than this are treated as "left the room".
const PRESENCE_STALE_MS = 30_000

/**
 * Heartbeat for anyone in a live room (host + listeners). Upserts the caller's
 * presence row; the very first time a listener appears it also posts a
 * "<name> entered the room" system message (nothing is posted when they leave).
 * Returns the current fresh audience so the caller can render count + names.
 */
export async function heartbeatPresence(input: {
  roomName: string
}): Promise<{ count: number; members: LiveAudienceMember[] }> {
  const session = await auth.api.getSession({ headers: await headers() })
  const u = session?.user
  if (!u) return { count: 0, members: [] }

  const [stream] = await db
    .select({ hostId: liveStream.hostId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  const isHost = stream?.hostId === u.id

  // Has this user been (recently) present already? Decides whether to announce.
  const [existing] = await db
    .select({ id: livePresence.id, lastSeenAt: livePresence.lastSeenAt })
    .from(livePresence)
    .where(and(eq(livePresence.roomName, input.roomName), eq(livePresence.userId, u.id)))

  const now = new Date()
  const isNewArrival =
    !existing || now.getTime() - new Date(existing.lastSeenAt).getTime() > PRESENCE_STALE_MS

  if (existing) {
    await db
      .update(livePresence)
      .set({ lastSeenAt: now, userName: u.name, userImage: u.image ?? null, isHost })
      .where(eq(livePresence.id, existing.id))
  } else {
    await db.insert(livePresence).values({
      roomName: input.roomName,
      userId: u.id,
      userName: u.name,
      userImage: u.image ?? null,
      isHost,
    })
  }

  // Announce arrivals for listeners only (the host's presence isn't announced).
  if (isNewArrival && !isHost) {
    await db.insert(liveChatMessage).values({
      roomName: input.roomName,
      userId: u.id,
      userName: u.name,
      userImage: u.image ?? null,
      isHost: false,
      kind: "system",
      body: `${u.name} entered the room`,
    })
  }

  return getAudience({ roomName: input.roomName })
}

/** Current fresh audience for a room (everyone whose heartbeat is recent). */
export async function getAudience(input: {
  roomName: string
}): Promise<{ count: number; members: LiveAudienceMember[] }> {
  const rows = await db
    .select()
    .from(livePresence)
    .where(
      and(
        eq(livePresence.roomName, input.roomName),
        gt(livePresence.lastSeenAt, new Date(Date.now() - PRESENCE_STALE_MS)),
      ),
    )
    .orderBy(desc(livePresence.isHost), asc(livePresence.createdAt))

  const members: LiveAudienceMember[] = rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    userImage: r.userImage ?? null,
    isHost: r.isHost,
  }))
  // Audience count excludes the host (it's the listener count).
  const count = members.filter((m) => !m.isHost).length
  return { count, members }
}

/** Removes the caller's presence row when they intentionally leave a room. */
export async function leavePresence(input: { roomName: string }): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  const u = session?.user
  if (!u) return
  await db
    .delete(livePresence)
    .where(and(eq(livePresence.roomName, input.roomName), eq(livePresence.userId, u.id)))
}

// --- Reactions & virtual gifts ---------------------------------------------

export type LiveReactionView = {
  id: number
  userId: string
  userName: string
  kind: "reaction" | "gift"
  emoji: string
  label: string | null
}

/** Sends a reaction or virtual gift that every participant will see float up. */
export async function sendLiveReaction(input: {
  roomName: string
  emoji: string
  kind?: "reaction" | "gift"
  label?: string
}): Promise<void> {
  const user = await requireUser()
  const emoji = input.emoji.trim().slice(0, 8)
  if (!emoji) return
  await db.insert(liveReaction).values({
    roomName: input.roomName,
    userId: user.id,
    userName: user.name,
    kind: input.kind ?? "reaction",
    emoji,
    label: input.label?.trim().slice(0, 40) ?? null,
  })
}

/** Polls recent reactions for a room (only those after `afterId`). */
export async function getLiveReactions(input: {
  roomName: string
  afterId?: number
}): Promise<LiveReactionView[]> {
  const rows = await db
    .select()
    .from(liveReaction)
    .where(
      input.afterId
        ? and(eq(liveReaction.roomName, input.roomName), gt(liveReaction.id, input.afterId))
        : eq(liveReaction.roomName, input.roomName),
    )
    .orderBy(asc(liveReaction.id))
    .limit(60)

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    kind: r.kind as "reaction" | "gift",
    emoji: r.emoji,
    label: r.label,
  }))
}

/**
 * The current user's own still-live audio stream, if any. Used so the host can
 * resume broadcasting (rather than starting a duplicate or being shown the
 * offline setup) when they reopen the studio after signing back in.
 */
export async function getMyActiveStream(): Promise<LiveStreamView | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  await endStaleStreams()
  const [r] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.hostId, session.user.id), eq(liveStream.status, "live")))
    .orderBy(desc(liveStream.startedAt))
  if (!r || (r.mode ?? "audio") !== "audio") return null
  return {
    id: r.id,
    roomName: r.roomName,
    hostId: r.hostId,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    category: r.category,
    cover: r.cover,
    mode: (r.mode as LiveMode) ?? "audio",
    orientation: (r.orientation as LiveOrientation) ?? "portrait",
    visibility: (r.visibility as LiveVisibility) ?? "public",
    locked: r.locked ?? false,
    pinnedChatId: r.pinnedChatId ?? null,
    chatBgUrl: r.chatBgUrl,
    chatBgEffect: (r.chatBgEffect as ChatBgEffect) ?? "none",
    theme: r.theme ?? "default",
    startedAt: r.startedAt.toISOString(),
  }
}

/**
 * The current user's own still-live *video* stream, if any. Lets the host
 * resume their broadcast (rather than starting a duplicate) when they reopen
 * the studio after minimising or signing back in.
 */
export async function getMyActiveVideoStream(): Promise<LiveStreamView | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  await endStaleStreams()
  const [r] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.hostId, session.user.id), eq(liveStream.status, "live")))
    .orderBy(desc(liveStream.startedAt))
  if (!r || (r.mode ?? "audio") !== "video") return null
  return {
    id: r.id,
    roomName: r.roomName,
    hostId: r.hostId,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    category: r.category,
    cover: r.cover,
    mode: (r.mode as LiveMode) ?? "video",
    orientation: (r.orientation as LiveOrientation) ?? "portrait",
    visibility: (r.visibility as LiveVisibility) ?? "public",
    locked: r.locked ?? false,
    pinnedChatId: r.pinnedChatId ?? null,
    chatBgUrl: r.chatBgUrl,
    chatBgEffect: (r.chatBgEffect as ChatBgEffect) ?? "none",
    theme: r.theme ?? "default",
    startedAt: r.startedAt.toISOString(),
  }
}

/** A single live stream by room name. */
export async function getLiveStream(roomName: string): Promise<LiveStreamView | null> {
  await endStaleStreams()
  const [r] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.roomName, roomName), eq(liveStream.status, "live")))
  if (!r) return null
  return {
    id: r.id,
    roomName: r.roomName,
    hostId: r.hostId,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    category: r.category,
    cover: r.cover,
    mode: (r.mode as LiveMode) ?? "audio",
    orientation: (r.orientation as LiveOrientation) ?? "portrait",
    visibility: (r.visibility as LiveVisibility) ?? "public",
    locked: r.locked ?? false,
    pinnedChatId: r.pinnedChatId ?? null,
    chatBgUrl: r.chatBgUrl,
    chatBgEffect: (r.chatBgEffect as ChatBgEffect) ?? "none",
    theme: r.theme ?? "default",
    startedAt: r.startedAt.toISOString(),
  }
}

// --- Guest call-in system --------------------------------------------------

export type LiveRole = "host" | "cohost" | "guest"

export type CoHostPermissions = {
  acceptRequests: boolean
  controlTracks: boolean
  endSession: boolean
}

export type CallRequestView = {
  id: number
  userId: string
  userName: string
  initials: string
  color: string
  kind: "request" | "invite"
  // "left" = a co-host who stepped off the call but is still granted co-host
  // status (can call back in); distinct from "ended" (gone from the room).
  status: "pending" | "accepted" | "declined" | "ended" | "left"
  // "guest" = ordinary speaker on stage; "cohost" = promoted by the main host.
  role: "guest" | "cohost"
  // Co-host permissions (meaningful only while role === "cohost").
  permissions: CoHostPermissions
  // Music approval flow state for a track-controlling co-host.
  musicApproved: boolean
  musicRequestPending: boolean
}

export type BlockedUserView = {
  userId: string
  userName: string
  initials: string
  color: string
}

async function getHostId(roomName: string): Promise<string | null> {
  const [s] = await db.select({ hostId: liveStream.hostId }).from(liveStream).where(eq(liveStream.roomName, roomName))
  return s?.hostId ?? null
}

function mapRequest(r: typeof liveCallRequest.$inferSelect): CallRequestView {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    initials: getInitials(r.userName),
    color: getAvatarColor(r.userId),
    kind: r.kind as "request" | "invite",
    status: r.status as CallRequestView["status"],
    role: (r.role as "guest" | "cohost") ?? "guest",
    permissions: {
      acceptRequests: r.canAcceptRequests ?? false,
      controlTracks: r.canControlTracks ?? false,
      endSession: r.canEndSession ?? false,
    },
    musicApproved: r.musicApproved ?? false,
    musicRequestPending: r.musicRequestPending ?? false,
  }
}

/** True if the user may accept call requests: the main host, or a co-host
 *  who has been granted the "Accept Call Requests" permission. A co-host keeps
 *  this power even while off the call (status "left"). */
async function canManageRequests(roomName: string, userId: string): Promise<boolean> {
  if ((await getHostId(roomName)) === userId) return true
  const [row] = await db
    .select({ role: liveCallRequest.role, can: liveCallRequest.canAcceptRequests, status: liveCallRequest.status })
    .from(liveCallRequest)
    .where(and(eq(liveCallRequest.roomName, roomName), eq(liveCallRequest.userId, userId)))
    .orderBy(desc(liveCallRequest.updatedAt))
  return (row?.status === "accepted" || row?.status === "left") && row.role === "cohost" && !!row.can
}

/** Latest co-host-granted row for a user, regardless of status. The grant
 *  lives on the row, so it survives stepping off the call (status "left") or
 *  leaving the room (status "ended") — letting the host still manage them. */
async function getCoHostRow(roomName: string, userId: string) {
  const [row] = await db
    .select()
    .from(liveCallRequest)
    .where(
      and(
        eq(liveCallRequest.roomName, roomName),
        eq(liveCallRequest.userId, userId),
        eq(liveCallRequest.role, "cohost"),
      ),
    )
    .orderBy(desc(liveCallRequest.updatedAt))
  return row ?? null
}

/** Count of guests currently allowed live (accepted requests/invites). */
async function acceptedGuestCount(roomName: string): Promise<number> {
  const rows = await db
    .select({ id: liveCallRequest.id })
    .from(liveCallRequest)
    .where(and(eq(liveCallRequest.roomName, roomName), eq(liveCallRequest.status, "accepted")))
  return rows.length
}

/** Listener asks to come on as a guest. */
export async function requestToJoin(input: { roomName: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  // Honor a host-locked stage or a disabled guest section: no new requests.
  const [s] = await db
    .select({ locked: liveStream.locked, guestsEnabled: liveStream.guestsEnabled })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  if (s && !s.guestsEnabled) return { ok: false, error: "The host has turned off call-ins." }
  if (s?.locked) return { ok: false, error: "The host has locked the stage." }
  // Clear any prior resolved row for this user so they can re-request.
  await db
    .delete(liveCallRequest)
    .where(
      and(
        eq(liveCallRequest.roomName, input.roomName),
        eq(liveCallRequest.userId, user.id),
        eq(liveCallRequest.kind, "request"),
      ),
    )
  await db.insert(liveCallRequest).values({
    roomName: input.roomName,
    userId: user.id,
    userName: user.name,
    kind: "request",
    status: "pending",
  })
  return { ok: true }
}

/** Host invites a specific listener to come on as a guest. */
export async function inviteToStage(input: { roomName: string; userId: string; userName: string }): Promise<void> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can invite guests.")
  await db
    .delete(liveCallRequest)
    .where(
      and(
        eq(liveCallRequest.roomName, input.roomName),
        eq(liveCallRequest.userId, input.userId),
        eq(liveCallRequest.kind, "invite"),
      ),
    )
  await db.insert(liveCallRequest).values({
    roomName: input.roomName,
    userId: input.userId,
    userName: input.userName,
    kind: "invite",
    status: "pending",
  })
  // Real notification so the invited user hears about it even if they're not
  // looking at the room right now (they still accept/decline in-session).
  await notifyUser({
    userId: input.userId,
    actorId: user.id,
    actorName: user.name,
    type: "live",
    message: "invited you to join the live as a guest",
    link: `/live/${input.roomName}`,
  })
}

/**
 * Host blocks a participant: they are kicked from the LiveKit room, pulled off
 * the stage if they were speaking, and prevented from rejoining for the life of
 * the broadcast. Host-only; the host can't block themselves.
 */
export async function blockParticipant(input: {
  roomName: string
  userId: string
  userName: string
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can block participants." }
  if (input.userId === user.id) return { ok: false, error: "You can't block yourself." }

  // Record the block (idempotent — clear any prior row first).
  await db
    .delete(liveBlocked)
    .where(and(eq(liveBlocked.roomName, input.roomName), eq(liveBlocked.userId, input.userId)))
  await db.insert(liveBlocked).values({
    roomName: input.roomName,
    userId: input.userId,
    userName: input.userName,
  })

  // If they were on stage, end their speaking rows too so they don't linger.
  await db
    .update(liveCallRequest)
    .set({ status: "ended", updatedAt: new Date() })
    .where(and(eq(liveCallRequest.roomName, input.roomName), eq(liveCallRequest.userId, input.userId)))

  // Hard-kick them out of the live room immediately.
  await removeParticipant({ roomName: input.roomName, identity: input.userId })
  return { ok: true }
}

/** Host lifts a block, letting the participant rejoin. Host-only. */
export async function unblockParticipant(input: {
  roomName: string
  userId: string
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can unblock participants." }
  await db
    .delete(liveBlocked)
    .where(and(eq(liveBlocked.roomName, input.roomName), eq(liveBlocked.userId, input.userId)))
  return { ok: true }
}

/**
 * Host force-mutes a participant's mic in a grid meeting (server-side hard
 * mute). Host-only; the host can't mute themselves this way. To bring someone
 * back on, the host sends an "ask to unmute" data message from the client —
 * a server can't silently reopen a mic.
 */
export async function muteParticipant(input: {
  roomName: string
  userId: string
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can mute participants." }
  if (input.userId === user.id) return { ok: false, error: "You can't mute yourself." }
  await muteParticipantAudio({ roomName: input.roomName, identity: input.userId })
  return { ok: true }
}

/** Host accepts a pending request (or listener accepts an invite is handled separately). */
export async function respondToCallRequest(input: {
  id: number
  accept: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const [req] = await db.select().from(liveCallRequest).where(eq(liveCallRequest.id, input.id))
  if (!req) return { ok: false, error: "Request no longer exists." }

  // Authorization: the host ��� or a co-host with the Accept Call Requests
  // permission — responds to "request"; the invited user responds to "invite".
  if (req.kind === "request" && !(await canManageRequests(req.roomName, user.id)))
    return { ok: false, error: "Not authorized." }
  if (req.kind === "invite" && req.userId !== user.id) return { ok: false, error: "Not authorized." }

  if (input.accept) {
    if ((await acceptedGuestCount(req.roomName)) >= MAX_GUESTS) {
      return { ok: false, error: `All ${MAX_GUESTS} guest spots are full.` }
    }
    await setParticipantPublish({ roomName: req.roomName, identity: req.userId, canPublish: true })
    await db
      .update(liveCallRequest)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(liveCallRequest.id, input.id))
  } else {
    await db
      .update(liveCallRequest)
      .set({ status: "declined", updatedAt: new Date() })
      .where(eq(liveCallRequest.id, input.id))
  }
  return { ok: true }
}

/** Removes a guest from the stage (host action or guest leaving) -> back to listener. */
export async function removeFromStage(input: { roomName: string; userId: string }): Promise<void> {
  const user = await requireUser()
  const hostId = await getHostId(input.roomName)
  if (hostId !== user.id && user.id !== input.userId) throw new Error("Not authorized.")

  await setParticipantPublish({ roomName: input.roomName, identity: input.userId, canPublish: false })
  await db
    .update(liveCallRequest)
    .set({ status: "ended", updatedAt: new Date() })
    .where(
      and(
        eq(liveCallRequest.roomName, input.roomName),
        eq(liveCallRequest.userId, input.userId),
        eq(liveCallRequest.status, "accepted"),
      ),
    )
}

/**
 * A participant steps off the call but stays in the room. For a co-host this
 * preserves their grant (status -> "left") so they can call back in and keep
 * their permissions; for a plain guest it behaves like leaving the stage.
 * Self-only.
 */
export async function stepOffStage(input: { roomName: string }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  await setParticipantPublish({ roomName: input.roomName, identity: user.id, canPublish: false })
  const [row] = await db
    .select()
    .from(liveCallRequest)
    .where(and(eq(liveCallRequest.roomName, input.roomName), eq(liveCallRequest.userId, user.id)))
    .orderBy(desc(liveCallRequest.updatedAt))
  if (!row) return { ok: true }
  // Co-hosts keep their grant (and thus reappear in the host's Co-hosts tab as
  // "Off call"); ordinary guests are simply removed from the stage.
  const nextStatus = row.role === "cohost" ? "left" : "ended"
  await db
    .update(liveCallRequest)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * A co-host who stepped off / dropped the call rejoins the stage. No host
 * approval needed (they are already trusted), but the guest cap still applies.
 * Self-only.
 */
export async function callIn(input: { roomName: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const row = await getCoHostRow(input.roomName, user.id)
  if (!row) return { ok: false, error: "You're not a co-host of this session." }
  if (row.status !== "accepted") {
    if ((await acceptedGuestCount(input.roomName)) >= MAX_GUESTS) {
      return { ok: false, error: `All ${MAX_GUESTS} stage spots are full.` }
    }
  }
  await setParticipantPublish({ roomName: input.roomName, identity: user.id, canPublish: true })
  await db
    .update(liveCallRequest)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * Polled by host (sees pending requests + accepted guests) and by listeners
 * (sees their own invite + whether they were accepted).
 */
export async function getCallState(input: { roomName: string }): Promise<{
  pendingRequests: CallRequestView[]
  guests: CallRequestView[]
  myInvite: CallRequestView | null
  myStatus: CallRequestView["status"] | null
  chatBgUrl: string | null
  chatBgEffect: ChatBgEffect
  locked: boolean
  // Host toggle for the guest call-in section (default true). When false,
  // viewers see no call-in slots and the space is given to video + chat.
  guestsEnabled: boolean
  pinnedChatId: number | null
  // Host-chosen studio theme id, polled so listeners restyle live.
  theme: string
  // True once the host has ended the broadcast — lets listeners auto-close.
  ended: boolean
  // True when the caller has been blocked by the host — lets the viewer auto-exit.
  blocked: boolean
  // Users the host has blocked from this room (host view: drives the Unblock list).
  blockedUsers: BlockedUserView[]
  // --- Co-host system (polled so promotions/permissions apply ~instantly) ---
  // The caller's own role + permissions in this room.
  myRole: LiveRole
  myPermissions: CoHostPermissions
  myMusicApproved: boolean
  myMusicRequestPending: boolean
  // True when the caller is actively publishing on the call (status "accepted").
  // A co-host who stepped off keeps myRole "cohost" but myOnCall false.
  myOnCall: boolean
  // Every user granted co-host status, regardless of whether they're currently
  // on the call — drives the host's Co-hosts management tab. Each entry's
  // `status` is "accepted" (On stage) or otherwise (Off call).
  coHosts: CallRequestView[]
  // The single co-host (if any) who currently controls music — when set, the
  // host's own music controls are disabled and handed to that co-host.
  musicControllerId: string | null
  // Pending "may I control music?" request from a co-host (host view: approve/decline).
  musicApprovalRequest: CallRequestView | null
  // A co-host's pending "end live session" request awaiting the host's answer.
  // Includes who asked and how many ms remain before the live auto-ends.
  endRequest: { byId: string; byName: string; remainingMs: number } | null
}> {
  // Auto-end abandoned streams first so listeners of a vanished host close out.
  await endStaleStreams()
  const session = await auth.api.getSession({ headers: await headers() })
  const me = session?.user?.id ?? null

  let [stream] = await db
    .select({
      chatBgUrl: liveStream.chatBgUrl,
      chatBgEffect: liveStream.chatBgEffect,
      status: liveStream.status,
      locked: liveStream.locked,
      guestsEnabled: liveStream.guestsEnabled,
      pinnedChatId: liveStream.pinnedChatId,
      theme: liveStream.theme,
      endRequestAt: liveStream.endRequestAt,
      endRequestById: liveStream.endRequestById,
      endRequestByName: liveStream.endRequestByName,
    })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))

  // A co-host's "end live session" request that the host never answered. Once
  // the 30s window elapses, the live ends automatically on the next poll.
  let endRequest: { byId: string; byName: string; remainingMs: number } | null = null
  if (stream && stream.status === "live" && stream.endRequestAt) {
    const remainingMs = END_REQUEST_WINDOW_MS - (Date.now() - stream.endRequestAt.getTime())
    if (remainingMs <= 0) {
      await db
        .update(liveStream)
        .set({
          status: "ended",
          endedAt: new Date(),
          endRequestAt: null,
          endRequestById: null,
          endRequestByName: null,
        })
        .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))
      revalidatePath("/live")
      stream = { ...stream, status: "ended" }
    } else if (stream.endRequestById) {
      endRequest = {
        byId: stream.endRequestById,
        byName: stream.endRequestByName ?? "A co-host",
        remainingMs,
      }
    }
  }

  const rows = await db
    .select()
    .from(liveCallRequest)
    .where(eq(liveCallRequest.roomName, input.roomName))
    .orderBy(asc(liveCallRequest.createdAt))

  // Blocked participants for this room (host list) + whether the caller is one.
  const blockedRows = await db
    .select()
    .from(liveBlocked)
    .where(eq(liveBlocked.roomName, input.roomName))
    .orderBy(asc(liveBlocked.createdAt))
  const blocked = me ? blockedRows.some((b) => b.userId === me) : false
  const blockedUsers: BlockedUserView[] = blockedRows.map((b) => ({
    userId: b.userId,
    userName: b.userName,
    initials: getInitials(b.userName),
    color: getAvatarColor(b.userId),
  }))

  const pendingRequests = rows.filter((r) => r.kind === "request" && r.status === "pending").map(mapRequest)
  const acceptedRows = rows.filter((r) => r.status === "accepted")
  const guests = acceptedRows.map(mapRequest)
  // All granted co-hosts, deduped to the latest row per user, regardless of
  // status — so off-call co-hosts still appear in the host's management tab.
  const coHostByUser = new Map<string, typeof liveCallRequest.$inferSelect>()
  for (const r of rows) {
    if (r.role !== "cohost") continue
    const prev = coHostByUser.get(r.userId)
    if (!prev || r.updatedAt.getTime() > prev.updatedAt.getTime()) coHostByUser.set(r.userId, r)
  }
  // Sort On-stage (accepted) first, then by most recent. The host can retract
  // any of them whether or not they're still in the session.
  const coHosts = [...coHostByUser.values()]
    .sort((a, b) => {
      const aOn = a.status === "accepted" ? 0 : 1
      const bOn = b.status === "accepted" ? 0 : 1
      return aOn - bOn || b.updatedAt.getTime() - a.updatedAt.getTime()
    })
    .map(mapRequest)
  const myRows = me ? rows.filter((r) => r.userId === me) : []
  const myInvite = myRows.find((r) => r.kind === "invite" && r.status === "pending")
  const mine = [...myRows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]

  const hostId = stream ? await getHostId(input.roomName) : null
  // A co-host keeps their role + permissions whether on the call ("accepted")
  // or stepped off ("left"); only the host outranks them.
  const myCoHost = mine && mine.role === "cohost" && (mine.status === "accepted" || mine.status === "left") ? mine : null
  const myRole: LiveRole = me && hostId === me ? "host" : myCoHost ? "cohost" : "guest"
  const myOnCall = mine?.status === "accepted"
  const myPermissions: CoHostPermissions =
    myRole === "cohost"
      ? {
          acceptRequests: myCoHost?.canAcceptRequests ?? false,
          controlTracks: myCoHost?.canControlTracks ?? false,
          endSession: myCoHost?.canEndSession ?? false,
        }
      : { acceptRequests: false, controlTracks: false, endSession: false }

  // A co-host controls music once they have the Control Tracks permission AND
  // their first upload has been approved by the host.
  const controller = acceptedRows.find(
    (r) => r.role === "cohost" && r.canControlTracks && r.musicApproved,
  )
  // A pending approval request (only relevant to the host).
  const pendingMusic = acceptedRows.find(
    (r) => r.role === "cohost" && r.canControlTracks && r.musicRequestPending && !r.musicApproved,
  )

  return {
    pendingRequests,
    guests,
    myInvite: myInvite ? mapRequest(myInvite) : null,
    myStatus: mine ? (mine.status as CallRequestView["status"]) : null,
    chatBgUrl: stream?.chatBgUrl ?? null,
    chatBgEffect: (stream?.chatBgEffect as ChatBgEffect) ?? "none",
    locked: stream?.locked ?? false,
    guestsEnabled: stream?.guestsEnabled ?? true,
    pinnedChatId: stream?.pinnedChatId ?? null,
    theme: stream?.theme ?? "default",
    // No row, or row flipped to "ended", both mean the session is over.
    ended: !stream || stream.status !== "live",
    blocked,
    blockedUsers,
    myRole,
    myPermissions,
    myMusicApproved: myCoHost?.musicApproved ?? false,
    myMusicRequestPending: myCoHost?.musicRequestPending ?? false,
    myOnCall,
    coHosts,
    musicControllerId: controller?.userId ?? null,
    musicApprovalRequest: pendingMusic ? mapRequest(pendingMusic) : null,
    endRequest,
  }
}

// --- Co-host system --------------------------------------------------------

/** Loads the accepted on-stage row for a user, or null. */
async function getAcceptedRow(roomName: string, userId: string) {
  const [row] = await db
    .select()
    .from(liveCallRequest)
    .where(
      and(
        eq(liveCallRequest.roomName, roomName),
        eq(liveCallRequest.userId, userId),
        eq(liveCallRequest.status, "accepted"),
      ),
    )
    .orderBy(desc(liveCallRequest.updatedAt))
  return row ?? null
}

/**
 * Main host promotes an accepted speaker to co-host. Co-hosts start with only
 * the "Accept Call Requests" permission enabled (per spec). Host-only.
 */
export async function makeCoHost(input: { roomName: string; userId: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can add co-hosts." }
  const row = await getAcceptedRow(input.roomName, input.userId)
  if (!row) return { ok: false, error: "That speaker is no longer on stage." }
  await db
    .update(liveCallRequest)
    .set({
      role: "cohost",
      canAcceptRequests: true,
      canControlTracks: false,
      canEndSession: false,
      musicApproved: false,
      musicRequestPending: false,
      updatedAt: new Date(),
    })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * Main host toggles a single co-host permission. Turning off Control Tracks
 * also clears the music approval state, so music control returns to the host.
 * Host-only.
 */
export async function setCoHostPermission(input: {
  roomName: string
  userId: string
  permission: "acceptRequests" | "controlTracks" | "endSession"
  enabled: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id)
    return { ok: false, error: "Only the host can manage co-hosts." }
  // Use the co-host grant row (any status) so permissions are editable even
  // while the co-host is off the call.
  const row = await getCoHostRow(input.roomName, input.userId)
  if (!row) return { ok: false, error: "That user is not a co-host." }

  const patch: Partial<typeof liveCallRequest.$inferInsert> = { updatedAt: new Date() }
  if (input.permission === "acceptRequests") patch.canAcceptRequests = input.enabled
  if (input.permission === "endSession") patch.canEndSession = input.enabled
  if (input.permission === "controlTracks") {
    patch.canControlTracks = input.enabled
    // Revoking Control Tracks immediately hands music back to the host.
    if (!input.enabled) {
      patch.musicApproved = false
      patch.musicRequestPending = false
    }
  }
  await db.update(liveCallRequest).set(patch).where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * Main host removes a co-host: they return to the ordinary Speaker (guest) role
 * and lose every co-host permission. They stay on stage as a speaker. Host-only.
 */
export async function removeCoHost(input: { roomName: string; userId: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can manage co-hosts." }
  // Retract via the grant row (any status), so the host can demote a co-host
  // whether or not they're still in the session.
  const row = await getCoHostRow(input.roomName, input.userId)
  if (!row) return { ok: false, error: "That user is not a co-host." }
  await db
    .update(liveCallRequest)
    .set({
      role: "guest",
      canAcceptRequests: false,
      canControlTracks: false,
      canEndSession: false,
      musicApproved: false,
      musicRequestPending: false,
      updatedAt: new Date(),
    })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * A track-controlling co-host requests music control the first time they try to
 * upload. Flags a pending approval the host resolves. No-op once approved.
 */
export async function requestMusicControl(input: { roomName: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const row = await getAcceptedRow(input.roomName, user.id)
  if (!row || row.role !== "cohost" || !row.canControlTracks)
    return { ok: false, error: "You don't have track control." }
  if (row.musicApproved) return { ok: true }
  await db
    .update(liveCallRequest)
    .set({ musicRequestPending: true, updatedAt: new Date() })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/** Main host approves/declines a co-host's pending music control request. Host-only. */
export async function resolveMusicControl(input: {
  roomName: string
  userId: string
  approve: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can decide." }
  const row = await getAcceptedRow(input.roomName, input.userId)
  if (!row || row.role !== "cohost") return { ok: false, error: "That user is not a co-host." }
  await db
    .update(liveCallRequest)
    .set({ musicApproved: input.approve, musicRequestPending: false, updatedAt: new Date() })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

// How long the host has to answer a co-host's "end live session" request
// before the live ends automatically. Not exported — a "use server" module may
// only export async functions; the client derives its countdown from the
// server-reported remainingMs instead.
const END_REQUEST_WINDOW_MS = 30_000

/**
 * A co-host who holds the End Session permission asks the host to end the live.
 * Instead of ending immediately, this records a pending request on the stream.
 * The host then has 30s to approve/decline; if unanswered, `getCallState`
 * auto-ends the stream once the window elapses.
 */
export async function requestEndSession(input: { roomName: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const row = await getAcceptedRow(input.roomName, user.id)
  if (!row || row.role !== "cohost" || !row.canEndSession)
    return { ok: false, error: "You can't end this session." }
  await db
    .update(liveStream)
    .set({ endRequestAt: new Date(), endRequestById: user.id, endRequestByName: user.name ?? row.userName })
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))
  return { ok: true }
}

/**
 * The host answers a co-host's pending "end live session" request. `approve`
 * true ends the broadcast immediately; false clears the request and the session
 * continues. Only the main host may resolve it.
 */
export async function resolveEndSession(input: {
  roomName: string
  approve: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id)
    return { ok: false, error: "Only the host can answer this request." }
  if (input.approve) {
    await db
      .update(liveStream)
      .set({
        status: "ended",
        endedAt: new Date(),
        endRequestAt: null,
        endRequestById: null,
        endRequestByName: null,
      })
      .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))
    revalidatePath("/live")
  } else {
    await db
      .update(liveStream)
      .set({ endRequestAt: null, endRequestById: null, endRequestByName: null })
      .where(eq(liveStream.roomName, input.roomName))
  }
  return { ok: true }
}

// --- Host-controlled chat background ---------------------------------------

export type ChatBgEffect = "none" | "blur" | "dim"

export async function setChatBackground(input: {
  roomName: string
  url?: string | null
  effect?: ChatBgEffect
}): Promise<void> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can change the background.")
  const patch: { chatBgUrl?: string | null; chatBgEffect?: ChatBgEffect } = {}
  if (input.url !== undefined) patch.chatBgUrl = input.url
  if (input.effect !== undefined) patch.chatBgEffect = input.effect
  await db.update(liveStream).set(patch).where(eq(liveStream.roomName, input.roomName))
}

// --- Host stage controls: lock & pinned comment ----------------------------

/** Host locks/unlocks the stage. While locked, no new requests to speak are accepted. */
export async function setRoomLock(input: { roomName: string; locked: boolean }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can lock the stage.")
  await db.update(liveStream).set({ locked: input.locked }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

/**
 * Host turns the guest call-in section on/off. When off, no call-in slots are
 * shown to viewers and the freed space is split between the host video and chat.
 */
export async function setGuestsEnabled(input: { roomName: string; enabled: boolean }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can change guest settings.")
  await db.update(liveStream).set({ guestsEnabled: input.enabled }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

/** Host switches the immersive studio theme. Applies live to all listeners. */
export async function setLiveTheme(input: { roomName: string; theme: string }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can change the theme.")
  await db.update(liveStream).set({ theme: input.theme }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

/** Host pins (or unpins, with chatId=null) a chat message to the top of the room. */
export async function pinLiveChat(input: { roomName: string; chatId: number | null }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can pin a comment.")
  await db.update(liveStream).set({ pinnedChatId: input.chatId }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}
