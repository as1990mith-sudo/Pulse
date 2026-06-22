"use server"

import { and, asc, desc, eq, ilike, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  chatroom,
  chatroomJoinRequest,
  chatroomMember,
  chatroomMessage,
  user as userTable,
} from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { EDIT_WINDOW_MS, DELETE_WINDOW_MS } from "@/lib/interactions"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 10)
}

export type ChatroomSummary = {
  id: number
  name: string
  description: string | null
  image: string | null
  ownerId: string
  ownerName: string
  inviteCode: string
  memberCount: number
  isOwner: boolean
  createdAt: string
}

export type ChatroomSearchResult = {
  id: number
  name: string
  description: string | null
  image: string | null
  ownerName: string
  memberCount: number
  isMember: boolean
  requestStatus: "pending" | "approved" | "rejected" | null
}

export type ChatAttachmentType = "image" | "video" | "audio" | "document"

export type ChatMessageView = {
  id: number
  userId: string
  userName: string
  initials: string
  color: string
  image: string | null
  body: string | null
  attachmentUrl: string | null
  attachmentType: ChatAttachmentType | null
  attachmentName: string | null
  isSelf: boolean
  pinned: boolean
  deleted: boolean
  edited: boolean
  postedAt: string
  createdAtMs: number
}

export type JoinRequestView = {
  id: number
  userId: string
  userName: string
  initials: string
  color: string
  createdAt: string
}

export type ChatroomDetail = {
  id: number
  name: string
  description: string | null
  image: string | null
  ownerId: string
  ownerName: string
  inviteCode: string
  isOwner: boolean
  currentUserId: string
  currentUserInitials: string
  currentUserColor: string
  currentUserImage: string | null
  members: { userId: string; userName: string; initials: string; color: string; role: string }[]
  messages: ChatMessageView[]
  joinRequests: JoinRequestView[]
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

type ChatMessageRow = {
  id: number
  userId: string
  userName: string
  body: string | null
  attachmentUrl: string | null
  attachmentType: string | null
  attachmentName: string | null
  pinned: boolean
  deleted: boolean
  editedAt: Date | null
  createdAt: Date
}

/**
 * Resolves profile images for a set of message-sender ids. Images live on the
 * user table (messages only denormalize the name), so we batch-fetch them.
 */
async function resolveSenderImages(userIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return map
  const rows = await db
    .select({ id: userTable.id, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, ids))
  for (const r of rows) map.set(r.id, r.image ?? null)
  return map
}

/** Maps a DB message row to the client view, hiding content of deleted ones. */
function toMessageView(
  m: ChatMessageRow,
  viewerId: string,
  imageMap: Map<string, string | null>,
): ChatMessageView {
  return {
    id: m.id,
    userId: m.userId,
    userName: m.userName,
    initials: getInitials(m.userName),
    color: getAvatarColor(m.userId),
    image: imageMap.get(m.userId) ?? null,
    body: m.deleted ? null : m.body,
    attachmentUrl: m.deleted ? null : m.attachmentUrl,
    attachmentType: m.deleted ? null : (m.attachmentType as ChatAttachmentType | null) ?? null,
    attachmentName: m.deleted ? null : m.attachmentName,
    isSelf: m.userId === viewerId,
    pinned: m.pinned,
    deleted: m.deleted,
    edited: m.deleted ? false : !!m.editedAt,
    postedAt: timeAgo(m.createdAt),
    createdAtMs: m.createdAt.getTime(),
  }
}

async function memberCounts(chatroomIds: number[]): Promise<Map<number, number>> {
  if (chatroomIds.length === 0) return new Map()
  const rows = await db
    .select({ chatroomId: chatroomMember.chatroomId })
    .from(chatroomMember)
    .where(inArray(chatroomMember.chatroomId, chatroomIds))
  const map = new Map<number, number>()
  for (const r of rows) map.set(r.chatroomId, (map.get(r.chatroomId) ?? 0) + 1)
  return map
}

/** Rooms the current user is a member of. */
export async function getMyChatrooms(): Promise<ChatroomSummary[]> {
  const user = await requireUser()
  const memberships = await db
    .select({ chatroomId: chatroomMember.chatroomId })
    .from(chatroomMember)
    .where(eq(chatroomMember.userId, user.id))
  const ids = memberships.map((m) => m.chatroomId)
  if (ids.length === 0) return []

  const rooms = await db
    .select()
    .from(chatroom)
    .where(inArray(chatroom.id, ids))
    .orderBy(desc(chatroom.createdAt))
  const counts = await memberCounts(ids)

  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    image: r.image,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    inviteCode: r.inviteCode,
    memberCount: counts.get(r.id) ?? 0,
    isOwner: r.ownerId === user.id,
    createdAt: timeAgo(r.createdAt),
  }))
}

/** Public search: find rooms by name. Returns membership + request status. */
export async function searchChatrooms(query: string): Promise<ChatroomSearchResult[]> {
  const user = await requireUser()
  const q = query.trim()
  if (!q) return []

  const rooms = await db
    .select()
    .from(chatroom)
    .where(ilike(chatroom.name, `%${q}%`))
    .orderBy(asc(chatroom.name))
    .limit(25)
  const ids = rooms.map((r) => r.id)
  const counts = await memberCounts(ids)

  const myMemberships = ids.length
    ? new Set(
        (
          await db
            .select({ chatroomId: chatroomMember.chatroomId })
            .from(chatroomMember)
            .where(and(eq(chatroomMember.userId, user.id), inArray(chatroomMember.chatroomId, ids)))
        ).map((m) => m.chatroomId),
      )
    : new Set<number>()

  const myRequests = ids.length
    ? await db
        .select()
        .from(chatroomJoinRequest)
        .where(and(eq(chatroomJoinRequest.userId, user.id), inArray(chatroomJoinRequest.chatroomId, ids)))
    : []
  const requestMap = new Map(myRequests.map((r) => [r.chatroomId, r.status as "pending" | "approved" | "rejected"]))

  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    image: r.image,
    ownerName: r.ownerName,
    memberCount: counts.get(r.id) ?? 0,
    isMember: myMemberships.has(r.id),
    requestStatus: requestMap.get(r.id) ?? null,
  }))
}

export async function createChatroom(input: {
  name: string
  description?: string | null
  image?: string | null
}) {
  const user = await requireUser()
  const name = input.name.trim()
  if (!name) throw new Error("Chatroom name is required.")

  const [room] = await db
    .insert(chatroom)
    .values({
      name,
      description: input.description?.trim() || null,
      image: input.image?.trim() || null,
      ownerId: user.id,
      ownerName: user.name,
      inviteCode: generateInviteCode(),
    })
    .returning()

  await db.insert(chatroomMember).values({
    chatroomId: room.id,
    userId: user.id,
    userName: user.name,
    role: "admin",
  })

  revalidatePath("/chatrooms")
  return room.id
}

/** Full detail for a room the user belongs to. Throws if not a member. */
export async function getChatroomDetail(chatroomId: number): Promise<ChatroomDetail> {
  const user = await requireUser()

  const [membership] = await db
    .select()
    .from(chatroomMember)
    .where(and(eq(chatroomMember.chatroomId, chatroomId), eq(chatroomMember.userId, user.id)))
  if (!membership) throw new Error("You are not a member of this chatroom.")

  const [room] = await db.select().from(chatroom).where(eq(chatroom.id, chatroomId))
  if (!room) throw new Error("Chatroom not found.")

  const isOwner = room.ownerId === user.id

  const members = await db
    .select()
    .from(chatroomMember)
    .where(eq(chatroomMember.chatroomId, chatroomId))
    .orderBy(asc(chatroomMember.joinedAt))

  const messages = await db
    .select()
    .from(chatroomMessage)
    .where(eq(chatroomMessage.chatroomId, chatroomId))
    .orderBy(asc(chatroomMessage.createdAt))

  const joinRequests = isOwner
    ? await db
        .select()
        .from(chatroomJoinRequest)
        .where(and(eq(chatroomJoinRequest.chatroomId, chatroomId), eq(chatroomJoinRequest.status, "pending")))
        .orderBy(asc(chatroomJoinRequest.createdAt))
    : []

  const imageMap = await resolveSenderImages([user.id, ...messages.map((m) => m.userId)])

  return {
    id: room.id,
    name: room.name,
    description: room.description,
    image: room.image,
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    inviteCode: room.inviteCode,
    isOwner,
    currentUserId: user.id,
    currentUserInitials: getInitials(user.name),
    currentUserColor: getAvatarColor(user.id),
    currentUserImage: imageMap.get(user.id) ?? null,
    members: members.map((m) => ({
      userId: m.userId,
      userName: m.userName,
      initials: getInitials(m.userName),
      color: getAvatarColor(m.userId),
      role: m.role,
    })),
    messages: messages.map((m) => toMessageView(m, user.id, imageMap)),
    joinRequests: joinRequests.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      initials: getInitials(r.userName),
      color: getAvatarColor(r.userId),
      createdAt: timeAgo(r.createdAt),
    })),
  }
}

export async function sendChatMessage(input: {
  chatroomId: number
  body?: string
  attachmentUrl?: string | null
  attachmentType?: ChatAttachmentType | null
  attachmentName?: string | null
}) {
  const user = await requireUser()
  const body = (input.body ?? "").trim()
  const hasAttachment = Boolean(input.attachmentUrl)
  if (!body && !hasAttachment) throw new Error("Message cannot be empty.")

  const [membership] = await db
    .select()
    .from(chatroomMember)
    .where(and(eq(chatroomMember.chatroomId, input.chatroomId), eq(chatroomMember.userId, user.id)))
  if (!membership) throw new Error("You are not a member of this chatroom.")

  await db.insert(chatroomMessage).values({
    chatroomId: input.chatroomId,
    userId: user.id,
    userName: user.name,
    body: body || null,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentType: hasAttachment ? input.attachmentType ?? "document" : null,
    attachmentName: input.attachmentName ?? null,
  })
  revalidatePath(`/chatrooms/${input.chatroomId}`)
}

/**
 * Lightweight message fetch used for real-time polling from the client. Returns
 * the full ordered message list for a room the user belongs to.
 */
export async function getChatMessages(chatroomId: number): Promise<ChatMessageView[]> {
  const user = await requireUser()

  const [membership] = await db
    .select()
    .from(chatroomMember)
    .where(and(eq(chatroomMember.chatroomId, chatroomId), eq(chatroomMember.userId, user.id)))
  if (!membership) throw new Error("You are not a member of this chatroom.")

  const messages = await db
    .select()
    .from(chatroomMessage)
    .where(eq(chatroomMessage.chatroomId, chatroomId))
    .orderBy(asc(chatroomMessage.createdAt))

  const imageMap = await resolveSenderImages(messages.map((m) => m.userId))
  return messages.map((m) => toMessageView(m, user.id, imageMap))
}

/** Deletes a message (soft delete — content is cleared but order kept). */
export async function deleteChatMessage(messageId: number) {
  const user = await requireUser()
  const [msg] = await db.select().from(chatroomMessage).where(eq(chatroomMessage.id, messageId))
  if (!msg) throw new Error("Message not found.")
  const [room] = await db.select().from(chatroom).where(eq(chatroom.id, msg.chatroomId))
  if (!room) throw new Error("Chatroom not found.")
  const isAdmin = room.ownerId === user.id
  const isAuthor = msg.userId === user.id
  if (!isAdmin && !isAuthor) throw new Error("You can't delete this message.")
  // Authors may only delete within the window; admins can remove anytime.
  if (!isAdmin && isAuthor && Date.now() - msg.createdAt.getTime() > DELETE_WINDOW_MS) {
    throw new Error("This message can no longer be deleted.")
  }

  await db.update(chatroomMessage).set({ deleted: true, pinned: false }).where(eq(chatroomMessage.id, messageId))
  revalidatePath(`/chatrooms/${msg.chatroomId}`)
}

/** Pins or unpins a message. The room admin may pin any message; a member may pin their own. */
export async function togglePinMessage(input: { messageId: number; pinned: boolean }) {
  const user = await requireUser()
  const [msg] = await db.select().from(chatroomMessage).where(eq(chatroomMessage.id, input.messageId))
  if (!msg) throw new Error("Message not found.")
  const [room] = await db.select().from(chatroom).where(eq(chatroom.id, msg.chatroomId))
  if (!room) throw new Error("Chatroom not found.")
  if (room.ownerId !== user.id && msg.userId !== user.id) {
    throw new Error("You can only pin your own messages.")
  }
  if (msg.deleted) throw new Error("You can't pin a deleted message.")

  await db.update(chatroomMessage).set({ pinned: input.pinned }).where(eq(chatroomMessage.id, input.messageId))
  revalidatePath(`/chatrooms/${msg.chatroomId}`)
}

/** Edits the author's own message body, within the edit window. */
export async function editChatMessage(input: { messageId: number; body: string }) {
  const user = await requireUser()
  const body = input.body.trim()
  if (!body) throw new Error("Message cannot be empty.")
  const [msg] = await db.select().from(chatroomMessage).where(eq(chatroomMessage.id, input.messageId))
  if (!msg) throw new Error("Message not found.")
  if (msg.userId !== user.id) throw new Error("You can only edit your own messages.")
  if (msg.deleted) throw new Error("You can't edit a deleted message.")
  if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new Error("This message can no longer be edited.")
  }

  await db.update(chatroomMessage).set({ body, editedAt: new Date() }).where(eq(chatroomMessage.id, input.messageId))
  revalidatePath(`/chatrooms/${msg.chatroomId}`)
}

/** Admin updates (or removes) the chatroom's group profile picture. */
export async function updateChatroomImage(input: { chatroomId: number; image: string | null }) {
  const user = await requireUser()
  const [room] = await db.select().from(chatroom).where(eq(chatroom.id, input.chatroomId))
  if (!room) throw new Error("Chatroom not found.")
  if (room.ownerId !== user.id) throw new Error("Only the chatroom admin can change the group picture.")

  await db
    .update(chatroom)
    .set({ image: input.image?.trim() || null })
    .where(eq(chatroom.id, input.chatroomId))
  revalidatePath(`/chatrooms/${input.chatroomId}`)
  revalidatePath("/chatrooms")
}

/** Join directly via an invite code (no approval needed). */
export async function joinByInviteCode(inviteCode: string) {
  const user = await requireUser()
  const code = inviteCode.trim()
  if (!code) throw new Error("Invite code is required.")

  const [room] = await db.select().from(chatroom).where(eq(chatroom.inviteCode, code))
  if (!room) throw new Error("Invalid invite code.")

  const [existing] = await db
    .select()
    .from(chatroomMember)
    .where(and(eq(chatroomMember.chatroomId, room.id), eq(chatroomMember.userId, user.id)))
  if (!existing) {
    await db.insert(chatroomMember).values({
      chatroomId: room.id,
      userId: user.id,
      userName: user.name,
      role: "member",
    })
  }
  revalidatePath("/chatrooms")
  return room.id
}

/** Request to join a room found via search. */
export async function requestToJoin(chatroomId: number) {
  const user = await requireUser()

  const [existingMember] = await db
    .select()
    .from(chatroomMember)
    .where(and(eq(chatroomMember.chatroomId, chatroomId), eq(chatroomMember.userId, user.id)))
  if (existingMember) return

  const [existingReq] = await db
    .select()
    .from(chatroomJoinRequest)
    .where(and(eq(chatroomJoinRequest.chatroomId, chatroomId), eq(chatroomJoinRequest.userId, user.id)))

  if (existingReq) {
    if (existingReq.status !== "pending") {
      await db
        .update(chatroomJoinRequest)
        .set({ status: "pending", createdAt: new Date() })
        .where(eq(chatroomJoinRequest.id, existingReq.id))
    }
  } else {
    await db.insert(chatroomJoinRequest).values({
      chatroomId,
      userId: user.id,
      userName: user.name,
    })
  }
  revalidatePath("/chatrooms")
}

/** Admin approves a pending join request. */
export async function approveJoinRequest(requestId: number) {
  const user = await requireUser()

  const [req] = await db.select().from(chatroomJoinRequest).where(eq(chatroomJoinRequest.id, requestId))
  if (!req) throw new Error("Request not found.")

  const [room] = await db.select().from(chatroom).where(eq(chatroom.id, req.chatroomId))
  if (!room || room.ownerId !== user.id) throw new Error("Only the chatroom admin can approve requests.")

  const [existing] = await db
    .select()
    .from(chatroomMember)
    .where(and(eq(chatroomMember.chatroomId, req.chatroomId), eq(chatroomMember.userId, req.userId)))
  if (!existing) {
    await db.insert(chatroomMember).values({
      chatroomId: req.chatroomId,
      userId: req.userId,
      userName: req.userName,
      role: "member",
    })
  }
  await db.update(chatroomJoinRequest).set({ status: "approved" }).where(eq(chatroomJoinRequest.id, requestId))
  revalidatePath(`/chatrooms/${req.chatroomId}`)
}

/** Admin rejects a pending join request. */
export async function rejectJoinRequest(requestId: number) {
  const user = await requireUser()

  const [req] = await db.select().from(chatroomJoinRequest).where(eq(chatroomJoinRequest.id, requestId))
  if (!req) throw new Error("Request not found.")

  const [room] = await db.select().from(chatroom).where(eq(chatroom.id, req.chatroomId))
  if (!room || room.ownerId !== user.id) throw new Error("Only the chatroom admin can reject requests.")

  await db.update(chatroomJoinRequest).set({ status: "rejected" }).where(eq(chatroomJoinRequest.id, requestId))
  revalidatePath(`/chatrooms/${req.chatroomId}`)
}

/** Leave a chatroom (owner cannot leave their own room). */
export async function leaveChatroom(chatroomId: number) {
  const user = await requireUser()
  const [room] = await db.select().from(chatroom).where(eq(chatroom.id, chatroomId))
  if (room && room.ownerId === user.id) throw new Error("The admin cannot leave their own chatroom.")
  await db
    .delete(chatroomMember)
    .where(and(eq(chatroomMember.chatroomId, chatroomId), eq(chatroomMember.userId, user.id)))
  revalidatePath("/chatrooms")
}
