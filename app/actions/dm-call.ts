"use server"

import { and, desc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { dmCall, dmConversation } from "@/lib/db/schema"
import { createAccessToken, isLiveKitConfigured, LIVEKIT_URL } from "@/lib/livekit"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

export type CallMode = "audio" | "video"
export type CallStatus = "ringing" | "active" | "declined" | "ended" | "missed"

export type DmCallView = {
  id: number
  conversationId: number
  callerId: string
  callerName: string
  calleeId: string
  mode: CallMode
  status: CallStatus
  isCaller: boolean
  // True once the callee's device has registered the ring (they're online).
  calleeAck: boolean
  roomName: string
}

function roomNameFor(callId: number): string {
  return `dm-call-${callId}`
}

function mapCall(row: typeof dmCall.$inferSelect, meId: string): DmCallView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    callerId: row.callerId,
    callerName: row.callerName,
    calleeId: row.calleeId,
    mode: row.mode as CallMode,
    status: row.status as CallStatus,
    isCaller: row.callerId === meId,
    calleeAck: row.calleeAck,
    roomName: roomNameFor(row.id),
  }
}

/** Confirms the signed-in user belongs to the conversation and returns the peer id. */
async function assertMembership(conversationId: number, meId: string): Promise<string> {
  const [convo] = await db.select().from(dmConversation).where(eq(dmConversation.id, conversationId))
  if (!convo) throw new Error("Conversation not found.")
  if (convo.userAId !== meId && convo.userBId !== meId) throw new Error("Not authorized.")
  return convo.userAId === meId ? convo.userBId : convo.userAId
}

/** Caller starts ringing the other participant. Cancels any stale call first. */
export async function startCall(input: { conversationId: number; mode: CallMode }): Promise<DmCallView> {
  const me = await requireUser()
  const calleeId = await assertMembership(input.conversationId, me.id)

  // End any lingering ringing/active calls in this conversation so we never
  // stack multiple live rooms.
  await db
    .update(dmCall)
    .set({ status: "ended", updatedAt: new Date() })
    .where(and(eq(dmCall.conversationId, input.conversationId), inArray(dmCall.status, ["ringing", "active"])))

  const [row] = await db
    .insert(dmCall)
    .values({
      conversationId: input.conversationId,
      callerId: me.id,
      callerName: me.name,
      calleeId,
      mode: input.mode,
      status: "ringing",
    })
    .returning()

  return mapCall(row, me.id)
}

/**
 * Callee's device acknowledges that it has received and is ringing the call.
 * This is what lets the caller switch from "Calling" (offline) to "Ringing".
 */
export async function ackCall(input: { callId: number }): Promise<void> {
  const me = await requireUser()
  const [row] = await db.select().from(dmCall).where(eq(dmCall.id, input.callId))
  if (!row || row.calleeId !== me.id || row.calleeAck) return
  await db.update(dmCall).set({ calleeAck: true, updatedAt: new Date() }).where(eq(dmCall.id, input.callId))
}

/** Callee accepts — flips the call to active so both sides connect. */
export async function acceptCall(input: { callId: number }): Promise<DmCallView> {
  const me = await requireUser()
  const [row] = await db.select().from(dmCall).where(eq(dmCall.id, input.callId))
  if (!row) throw new Error("Call no longer exists.")
  if (row.calleeId !== me.id) throw new Error("Not authorized.")

  const [updated] = await db
    .update(dmCall)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(dmCall.id, input.callId))
    .returning()
  return mapCall(updated, me.id)
}

/** Either party declines/cancels/hangs up. */
export async function endCall(input: { callId: number; declined?: boolean }): Promise<void> {
  const me = await requireUser()
  const [row] = await db.select().from(dmCall).where(eq(dmCall.id, input.callId))
  if (!row) return
  if (row.callerId !== me.id && row.calleeId !== me.id) throw new Error("Not authorized.")

  // A decline before the call ever connected is recorded distinctly so the UI
  // can show "declined" vs a normal hang-up.
  const nextStatus: CallStatus = input.declined && row.status === "ringing" ? "declined" : "ended"
  await db.update(dmCall).set({ status: nextStatus, updatedAt: new Date() }).where(eq(dmCall.id, input.callId))
}

/**
 * Polled by both clients. Returns the most relevant in-progress call for the
 * conversation (ringing or active), or null. Drives the incoming-call prompt
 * and the in-call UI on each side.
 */
export async function getActiveCall(input: { conversationId: number }): Promise<DmCallView | null> {
  const me = await requireUser()
  await assertMembership(input.conversationId, me.id)

  const [row] = await db
    .select()
    .from(dmCall)
    .where(
      and(eq(dmCall.conversationId, input.conversationId), inArray(dmCall.status, ["ringing", "active"])),
    )
    .orderBy(desc(dmCall.createdAt))
    .limit(1)

  if (!row) return null
  return mapCall(row, me.id)
}

/**
 * Lightweight global check for an incoming ringing call addressed to the
 * signed-in user (used to surface a ring from anywhere in messages).
 */
export async function getIncomingCall(): Promise<DmCallView | null> {
  const me = await requireUser()
  const [row] = await db
    .select()
    .from(dmCall)
    .where(and(eq(dmCall.calleeId, me.id), eq(dmCall.status, "ringing")))
    .orderBy(desc(dmCall.createdAt))
    .limit(1)
  if (!row) return null
  return mapCall(row, me.id)
}

/** Issues a LiveKit token scoped to the call room (publish enabled for both). */
export async function getCallToken(input: { callId: number }): Promise<{ token: string; url: string } | null> {
  const me = await requireUser()
  if (!isLiveKitConfigured()) return null

  const [row] = await db.select().from(dmCall).where(eq(dmCall.id, input.callId))
  if (!row) throw new Error("Call no longer exists.")
  if (row.callerId !== me.id && row.calleeId !== me.id) throw new Error("Not authorized.")

  const token = await createAccessToken({
    roomName: roomNameFor(row.id),
    identity: me.id,
    name: me.name,
    canPublish: true,
  })
  return { token, url: LIVEKIT_URL }
}
