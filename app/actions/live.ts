"use server"

import { and, asc, desc, eq, gt } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { liveStream, liveChatMessage, liveCallRequest, liveReaction } from "@/lib/db/schema"
import { getHandle, getAvatarColor, getInitials } from "@/lib/identity"
import { createAccessToken, isLiveKitConfigured, LIVEKIT_URL, setParticipantPublish } from "@/lib/livekit"
import { notifyFollowers } from "@/app/actions/notifications"

// Host + up to 11 guests = 12 on stage.
const MAX_GUESTS = 11

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
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
  chatBgUrl?: string | null
  chatBgEffect?: ChatBgEffect
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

  const [stream] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))

  if (!stream) return { ok: false, error: "This stream has ended." }

  const isHost = stream.hostId === user.id
  const token = await createAccessToken({
    roomName: input.roomName,
    identity: user.id,
    name: user.name,
    canPublish: isHost,
  })

  return { ok: true, token, serverUrl: LIVEKIT_URL, roomName: input.roomName, canPublish: isHost }
}

/** All currently-live streams, newest first. */
export async function getLiveStreams(): Promise<LiveStreamView[]> {
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
  isHost: boolean
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
    isHost: stream?.hostId === user.id,
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
    isHost: r.isHost,
    body: r.body,
  }))
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

/** A single live stream by room name. */
export async function getLiveStream(roomName: string): Promise<LiveStreamView | null> {
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
    chatBgUrl: r.chatBgUrl,
    chatBgEffect: (r.chatBgEffect as ChatBgEffect) ?? "none",
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
  // True once the host has ended the broadcast — lets listeners auto-close.
  ended: boolean
}> {
  const session = await auth.api.getSession({ headers: await headers() })
  const me = session?.user?.id ?? null

  const [stream] = await db
    .select({ chatBgUrl: liveStream.chatBgUrl, chatBgEffect: liveStream.chatBgEffect, status: liveStream.status })
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
