"use server"

import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { dmConversation, dmMessage, statusUpdate, statusView, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { DM_DELETE_WINDOW_MS } from "@/lib/dm-constants"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

export type DmAttachmentType = "image" | "video" | "audio" | "document"

export type DmMessageView = {
  id: number
  senderId: string
  body: string | null
  attachmentUrl: string | null
  attachmentType: DmAttachmentType | null
  attachmentName: string | null
  isSelf: boolean
  postedAt: string
  // Epoch ms of when the message was sent — lets the client decide whether the
  // 15-minute delete window is still open.
  createdAtMs: number
  pinned: boolean
  deleted: boolean
  // Set when this message is a reply/reaction to a status. statusActive is true
  // while the status is still live (clickable); statusThumb is a preview image.
  statusId: number | null
  statusActive: boolean
  statusThumb: string | null
}

export type DmConversationSummary = {
  id: number
  otherUserId: string
  otherUserName: string
  otherUserHandle: string
  initials: string
  color: string
  image: string | null
  lastMessage: string | null
  lastMessageAt: string
  unread: boolean
  // Story-ring state: does the other user have a live (non-expired) status, and
  // has the current user already seen all of it?
  hasActiveStatus: boolean
  statusAllViewed: boolean
  // Official "Frequency Team" priority thread, still unopened — pinned to top.
  priority: boolean
}

export type DmConversationDetail = {
  id: number
  otherUserId: string
  otherUserName: string
  otherUserHandle: string
  initials: string
  color: string
  image: string | null
  currentUserId: string
  currentUserInitials: string
  currentUserColor: string
  currentUserImage: string | null
  messages: DmMessageView[]
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

/** Orders a user pair so each conversation is stored uniquely. */
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function previewOf(body: string | null, attachmentType: string | null): string | null {
  if (body) return body
  if (attachmentType === "image") return "Photo"
  if (attachmentType === "video") return "Video"
  if (attachmentType === "audio") return "Audio"
  if (attachmentType === "document") return "Document"
  return null
}

type RawDmMessage = {
  id: number
  senderId: string
  body: string | null
  attachmentUrl: string | null
  attachmentType: string | null
  attachmentName: string | null
  statusId: number | null
  pinned: boolean
  deleted: boolean
  createdAt: Date
}

/**
 * For a batch of messages, resolves which referenced statuses are still live
 * (not expired) and grabs a thumbnail for the inbox preview.
 */
async function resolveStatusRefs(messages: RawDmMessage[]) {
  const ids = [...new Set(messages.map((m) => m.statusId).filter((v): v is number => v != null))]
  const map = new Map<number, { active: boolean; thumb: string | null }>()
  if (ids.length === 0) return map
  const rows = await db
    .select({ id: statusUpdate.id, mediaUrl: statusUpdate.mediaUrl, expiresAt: statusUpdate.expiresAt })
    .from(statusUpdate)
    .where(inArray(statusUpdate.id, ids))
  const now = Date.now()
  for (const r of rows) map.set(r.id, { active: r.expiresAt.getTime() > now, thumb: r.mediaUrl })
  return map
}

function toMessageView(
  m: RawDmMessage,
  userId: string,
  statusMap: Map<number, { active: boolean; thumb: string | null }>,
): DmMessageView {
  const ref = m.statusId != null ? statusMap.get(m.statusId) : undefined
  // Soft-deleted messages keep their slot in the thread but their content is
  // cleared so neither side can read it.
  return {
    id: m.id,
    senderId: m.senderId,
    body: m.deleted ? null : m.body,
    attachmentUrl: m.deleted ? null : m.attachmentUrl,
    attachmentType: m.deleted ? null : (m.attachmentType as DmAttachmentType | null) ?? null,
    attachmentName: m.deleted ? null : m.attachmentName,
    isSelf: m.senderId === userId,
    postedAt: timeAgo(m.createdAt),
    createdAtMs: m.createdAt.getTime(),
    pinned: m.pinned,
    deleted: m.deleted,
    statusId: m.deleted ? null : m.statusId ?? null,
    statusActive: m.deleted ? false : ref?.active ?? false,
    statusThumb: m.deleted ? null : ref?.thumb ?? null,
  }
}

/**
 * Finds the existing 1:1 conversation with another user, or creates one.
 * Returns the conversation id. Used by the "Message" button on profiles.
 */
export async function getOrCreateConversation(otherUserId: string): Promise<number> {
  const user = await requireUser()
  if (user.id === otherUserId) throw new Error("You can't message yourself.")

  const [other] = await db.select().from(userTable).where(eq(userTable.id, otherUserId)).limit(1)
  if (!other) throw new Error("That user does not exist.")

  const [userAId, userBId] = orderPair(user.id, otherUserId)

  const [existing] = await db
    .select()
    .from(dmConversation)
    .where(and(eq(dmConversation.userAId, userAId), eq(dmConversation.userBId, userBId)))
    .limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(dmConversation)
    .values({ userAId, userBId })
    .returning()
  return created.id
}

/** Inbox: all conversations for the current user, most recent first. */
export async function getConversations(): Promise<DmConversationSummary[]> {
  const user = await requireUser()

  const rows = await db
    .select()
    .from(dmConversation)
    .where(or(eq(dmConversation.userAId, user.id), eq(dmConversation.userBId, user.id)))
    .orderBy(desc(dmConversation.lastMessageAt))

  if (rows.length === 0) return []

  // Pre-compute which conversation partners have a live status, and whether the
  // current user has viewed all of it (grey ring) or not (gradient ring).
  const otherIds = rows.map((conv) => (conv.userAId === user.id ? conv.userBId : conv.userAId))
  const activeStatuses = await db
    .select({ id: statusUpdate.id, userId: statusUpdate.userId })
    .from(statusUpdate)
    .where(and(inArray(statusUpdate.userId, otherIds), gt(statusUpdate.expiresAt, new Date())))

  const statusIdsByUser = new Map<string, number[]>()
  for (const s of activeStatuses) {
    const arr = statusIdsByUser.get(s.userId) ?? []
    arr.push(s.id)
    statusIdsByUser.set(s.userId, arr)
  }

  const viewedStatusIds = new Set<number>()
  if (activeStatuses.length > 0) {
    const viewRows = await db
      .select({ statusId: statusView.statusId })
      .from(statusView)
      .where(
        and(
          eq(statusView.viewerId, user.id),
          inArray(
            statusView.statusId,
            activeStatuses.map((s) => s.id),
          ),
        ),
      )
    for (const v of viewRows) viewedStatusIds.add(v.statusId)
  }

  const summaries = await Promise.all(
    rows.map(async (conv) => {
      const otherId = conv.userAId === user.id ? conv.userBId : conv.userAId
      const myLastRead = conv.userAId === user.id ? conv.userALastReadAt : conv.userBLastReadAt
      const statusIds = statusIdsByUser.get(otherId) ?? []
      const hasActiveStatus = statusIds.length > 0
      const statusAllViewed = hasActiveStatus && statusIds.every((id) => viewedStatusIds.has(id))

      const [other] = await db.select().from(userTable).where(eq(userTable.id, otherId)).limit(1)
      const [last] = await db
        .select()
        .from(dmMessage)
        .where(eq(dmMessage.conversationId, conv.id))
        .orderBy(desc(dmMessage.createdAt))
        .limit(1)

      // Unread when the latest message arrived after I last opened the thread
      // and it wasn't sent by me.
      const unread = Boolean(last && last.senderId !== user.id && last.createdAt > myLastRead)

      return {
        id: conv.id,
        otherUserId: otherId,
        otherUserName: other?.name ?? "Unknown",
        otherUserHandle: getHandle(other?.name ?? "unknown"),
        initials: getInitials(other?.name ?? "?"),
        color: getAvatarColor(otherId),
        image: other?.image ?? null,
        lastMessage: last ? (last.deleted ? "Message deleted" : previewOf(last.body, last.attachmentType)) : null,
        lastMessageAt: timeAgo(conv.lastMessageAt),
        unread,
        hasActiveStatus,
        statusAllViewed,
        // Priority pinning only applies while the recipient hasn't opened it.
        priority: conv.priority && unread,
        lastMessageAtMs: conv.lastMessageAt.getTime(),
      }
    }),
  )

  // Hide brand-new conversations that have no messages yet from the inbox, then
  // pin still-unopened priority (Frequency Team) threads to the very top.
  return summaries
    .filter((s) => s.lastMessage !== null)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority ? -1 : 1
      return b.lastMessageAtMs - a.lastMessageAtMs
    })
    .map(({ lastMessageAtMs: _omit, ...s }) => s)
}

/** Number of conversations with unread messages — drives the nav badge. */
export async function getUnreadDmCount(): Promise<number> {
  const convos = await getConversations()
  return convos.filter((c) => c.unread).length
}

async function loadConversationForUser(conversationId: number, userId: string) {
  const [conv] = await db.select().from(dmConversation).where(eq(dmConversation.id, conversationId)).limit(1)
  if (!conv) throw new Error("Conversation not found.")
  if (conv.userAId !== userId && conv.userBId !== userId) {
    throw new Error("You are not part of this conversation.")
  }
  return conv
}

/** Full conversation detail. Marks the thread read for the current user. */
export async function getConversationDetail(conversationId: number): Promise<DmConversationDetail> {
  const user = await requireUser()
  const conv = await loadConversationForUser(conversationId, user.id)

  const otherId = conv.userAId === user.id ? conv.userBId : conv.userAId
  const [other] = await db.select().from(userTable).where(eq(userTable.id, otherId)).limit(1)

  const messages = await db
    .select()
    .from(dmMessage)
    .where(eq(dmMessage.conversationId, conversationId))
    .orderBy(asc(dmMessage.createdAt))

  // Mark read up to now for whichever side the current user is on. Opening the
  // thread also clears any priority pin (the recipient has now seen it).
  await db
    .update(dmConversation)
    .set(
      conv.userAId === user.id
        ? { userALastReadAt: new Date(), priority: false }
        : { userBLastReadAt: new Date(), priority: false },
    )
    .where(eq(dmConversation.id, conversationId))

  const statusMap = await resolveStatusRefs(messages)

  return {
    id: conv.id,
    otherUserId: otherId,
    otherUserName: other?.name ?? "Unknown",
    otherUserHandle: getHandle(other?.name ?? "unknown"),
    initials: getInitials(other?.name ?? "?"),
    color: getAvatarColor(otherId),
    image: other?.image ?? null,
    currentUserId: user.id,
    currentUserInitials: getInitials(user.name),
    currentUserColor: getAvatarColor(user.id),
    currentUserImage: user.image ?? null,
    messages: messages.map((m) => toMessageView(m, user.id, statusMap)),
  }
}

/** Lightweight message fetch for real-time polling. Also marks read. */
export async function getDmMessages(conversationId: number): Promise<DmMessageView[]> {
  const user = await requireUser()
  const conv = await loadConversationForUser(conversationId, user.id)

  const messages = await db
    .select()
    .from(dmMessage)
    .where(eq(dmMessage.conversationId, conversationId))
    .orderBy(asc(dmMessage.createdAt))

  await db
    .update(dmConversation)
    .set(
      conv.userAId === user.id
        ? { userALastReadAt: new Date(), priority: false }
        : { userBLastReadAt: new Date(), priority: false },
    )
    .where(eq(dmConversation.id, conversationId))

  const statusMap = await resolveStatusRefs(messages)
  return messages.map((m) => toMessageView(m, user.id, statusMap))
}

export async function sendDirectMessage(input: {
  conversationId: number
  body?: string
  attachmentUrl?: string | null
  attachmentType?: DmAttachmentType | null
  attachmentName?: string | null
  statusId?: number | null
}) {
  const user = await requireUser()
  await loadConversationForUser(input.conversationId, user.id)

  const body = (input.body ?? "").trim()
  const hasAttachment = Boolean(input.attachmentUrl)
  if (!body && !hasAttachment) throw new Error("Message cannot be empty.")

  await db.insert(dmMessage).values({
    conversationId: input.conversationId,
    senderId: user.id,
    body: body || null,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentType: hasAttachment ? input.attachmentType ?? "document" : null,
    attachmentName: input.attachmentName ?? null,
    statusId: input.statusId ?? null,
  })

  // Bump ordering + mark the sender's side read.
  await db
    .update(dmConversation)
    .set({ lastMessageAt: new Date() })
    .where(eq(dmConversation.id, input.conversationId))

  revalidatePath(`/messages/${input.conversationId}`)
  revalidatePath("/messages")
}

/**
 * Soft-deletes one of the current user's own messages, but only within the
 * 15-minute window after it was sent. Content is cleared while the row stays
 * so ordering is preserved.
 */
export async function deleteDirectMessage(messageId: number) {
  const user = await requireUser()
  const [msg] = await db.select().from(dmMessage).where(eq(dmMessage.id, messageId)).limit(1)
  if (!msg) throw new Error("Message not found.")
  await loadConversationForUser(msg.conversationId, user.id)

  if (msg.senderId !== user.id) throw new Error("You can only delete your own messages.")
  if (msg.deleted) return
  if (Date.now() - msg.createdAt.getTime() > DM_DELETE_WINDOW_MS) {
    throw new Error("This message can no longer be deleted.")
  }

  await db.update(dmMessage).set({ deleted: true, pinned: false }).where(eq(dmMessage.id, messageId))
  revalidatePath(`/messages/${msg.conversationId}`)
  revalidatePath("/messages")
}

/** Pins or unpins a message in the conversation (either participant may pin). */
export async function togglePinDirectMessage(input: { messageId: number; pinned: boolean }) {
  const user = await requireUser()
  const [msg] = await db.select().from(dmMessage).where(eq(dmMessage.id, input.messageId)).limit(1)
  if (!msg) throw new Error("Message not found.")
  await loadConversationForUser(msg.conversationId, user.id)
  if (msg.deleted) throw new Error("You can't pin a deleted message.")

  await db.update(dmMessage).set({ pinned: input.pinned }).where(eq(dmMessage.id, input.messageId))
  revalidatePath(`/messages/${msg.conversationId}`)
}
