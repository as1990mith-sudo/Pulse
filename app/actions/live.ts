"use server"

import { and, asc, desc, eq, gt, lt } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { liveStream, liveChatMessage, liveCallRequest, liveReaction, livePresence } from "@/lib/db/schema"
import { getHandle, getAvatarColor, getInitials } from "@/lib/identity"
import { createAccessToken, isLiveKitConfigured, LIVEKIT_URL, setParticipantPublish } from "@/lib/livekit"
import { notifyFollowers } from "@/app/actions/notifications"

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
}): Promise<GoLiveResult> {
  const user = await requireUser()
  if (!isLiveKitConfigured()) {
    return { ok: false, error: "Live is not configured yet. Add your LiveKit credentials to start broadcasting." }
  }
  const mode: LiveMode = input.mode === "video" ? "video" : "audio"

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
  // A host rejoining (e.g. recovering from a dropped connection) refreshes the
  // heartbeat right away so the in-flight reconnect isn't swept as stale.
  if (isHost) {
    await db
      .update(liveStream)
      .set({ lastSeenAt: new Date() })
      .where(eq(liveStream.roomName, input.roomName))
  }
  const token = await createAccessToken({
    roomName: input.roomName,
    identity: user.id,
    name: user.name,
    canPublish: isHost,
    metadata: JSON.stringify({ image: user.image ?? null }),
  })

  return { ok: true, token, serverUrl: LIVEKIT_URL, roomName: input.roomName, canPublish: isHost }
}

/** All currently-live streams, newest first. */
export async function getLiveStreams(): Promise<LiveStreamView[]> {
  await endStaleStreams()
  const rows = await db
    .select()
    .from(liveStream)
    .where(eq(liveStream.status, "live"))
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
    locked: r.locked ?? false,
    pinnedChatId: r.pinnedChatId ?? null,
    chatBgUrl: r.chatBgUrl,
    chatBgEffect: (r.chatBgEffect as ChatBgEffect) ?? "none",
    theme: r.theme ?? "default",
    startedAt: r.startedAt.toISOString(),
  }
}

// --- Guest call-in system --------------------------------------------------

export type CallRequestView = {
  id: number
  userId: string
  userName: string
  initials: string
  color: string
  kind: "request" | "invite"
  status: "pending" | "accepted" | "declined" | "ended"
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
  }
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
  // Honor a host-locked stage: no new requests to speak.
  const [s] = await db
    .select({ locked: liveStream.locked })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
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
}

/** Host accepts a pending request (or listener accepts an invite is handled separately). */
export async function respondToCallRequest(input: {
  id: number
  accept: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const [req] = await db.select().from(liveCallRequest).where(eq(liveCallRequest.id, input.id))
  if (!req) return { ok: false, error: "Request no longer exists." }

  const hostId = await getHostId(req.roomName)

  // Authorization: host responds to "request"; the invited user responds to "invite".
  if (req.kind === "request" && hostId !== user.id) return { ok: false, error: "Not authorized." }
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
  pinnedChatId: number | null
  // True once the host has ended the broadcast — lets listeners auto-close.
  ended: boolean
}> {
  // Auto-end abandoned streams first so listeners of a vanished host close out.
  await endStaleStreams()
  const session = await auth.api.getSession({ headers: await headers() })
  const me = session?.user?.id ?? null

  const [stream] = await db
    .select({
      chatBgUrl: liveStream.chatBgUrl,
      chatBgEffect: liveStream.chatBgEffect,
      status: liveStream.status,
      locked: liveStream.locked,
      pinnedChatId: liveStream.pinnedChatId,
    })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))

  const rows = await db
    .select()
    .from(liveCallRequest)
    .where(eq(liveCallRequest.roomName, input.roomName))
    .orderBy(asc(liveCallRequest.createdAt))

  const pendingRequests = rows.filter((r) => r.kind === "request" && r.status === "pending").map(mapRequest)
  const guests = rows.filter((r) => r.status === "accepted").map(mapRequest)
  const myRows = me ? rows.filter((r) => r.userId === me) : []
  const myInvite = myRows.find((r) => r.kind === "invite" && r.status === "pending")
  const mine = [...myRows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]

  return {
    pendingRequests,
    guests,
    myInvite: myInvite ? mapRequest(myInvite) : null,
    myStatus: mine ? (mine.status as CallRequestView["status"]) : null,
    chatBgUrl: stream?.chatBgUrl ?? null,
    chatBgEffect: (stream?.chatBgEffect as ChatBgEffect) ?? "none",
    locked: stream?.locked ?? false,
    pinnedChatId: stream?.pinnedChatId ?? null,
    // No row, or row flipped to "ended", both mean the session is over.
    ended: !stream || stream.status !== "live",
  }
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

/** Host pins (or unpins, with chatId=null) a chat message to the top of the room. */
export async function pinLiveChat(input: { roomName: string; chatId: number | null }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can pin a comment.")
  await db.update(liveStream).set({ pinnedChatId: input.chatId }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}
