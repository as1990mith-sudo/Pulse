"use server"

import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { chatroomMember } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import {
  createAccessToken,
  isLiveKitConfigured,
  listRoomParticipants,
  LIVEKIT_URL,
} from "@/lib/livekit"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

async function assertMembership(chatroomId: number, userId: string) {
  const [row] = await db
    .select({ id: chatroomMember.id })
    .from(chatroomMember)
    .where(and(eq(chatroomMember.chatroomId, chatroomId), eq(chatroomMember.userId, userId)))
    .limit(1)
  if (!row) throw new Error("You are not a member of this chatroom.")
}

/** Deterministic LiveKit room name for a chatroom's group call. */
function roomNameFor(chatroomId: number): string {
  return `chatroom-call-${chatroomId}`
}

export type ChatroomCallParticipant = {
  userId: string
  name: string
  initials: string
  color: string
  isSelf: boolean
}

export type ChatroomCallStatus = {
  configured: boolean
  active: boolean
  participants: ChatroomCallParticipant[]
}

/**
 * Group calls in a chatroom are presence-based: a call is "active" whenever at
 * least one member is connected to the room. Any member can join the shared
 * LiveKit room — there is no per-person ringing. Polled by every member.
 */
export async function getChatroomCallStatus(input: {
  chatroomId: number
}): Promise<ChatroomCallStatus> {
  const me = await requireUser()
  await assertMembership(input.chatroomId, me.id)

  if (!isLiveKitConfigured()) {
    return { configured: false, active: false, participants: [] }
  }

  const raw = await listRoomParticipants(roomNameFor(input.chatroomId))
  const participants: ChatroomCallParticipant[] = raw.map((p) => ({
    userId: p.identity,
    name: p.name,
    initials: getInitials(p.name),
    color: getAvatarColor(p.identity),
    isSelf: p.identity === me.id,
  }))

  return { configured: true, active: participants.length > 0, participants }
}

/** Mints a LiveKit token so the member can join (or start) the group call. */
export async function getChatroomCallToken(input: {
  chatroomId: number
}): Promise<{ token: string; url: string } | null> {
  const me = await requireUser()
  await assertMembership(input.chatroomId, me.id)
  if (!isLiveKitConfigured()) return null

  const token = await createAccessToken({
    roomName: roomNameFor(input.chatroomId),
    identity: me.id,
    name: me.name,
    canPublish: true,
  })
  return { token, url: LIVEKIT_URL }
}
