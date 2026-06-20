"use server"

import { and, asc, desc, eq, or } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { dmConversation, dmMessage, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"

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

  const summaries = await Promise.all(
    rows.map(async (conv) => {
      const otherId = conv.userAId === user.id ? conv.userBId : conv.userAId
      const myLastRead = conv.userAId === user.id ? conv.userALastReadAt : conv.userBLastReadAt

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
        lastMessage: last ? previewOf(last.body, last.attachmentType) : null,
        lastMessageAt: timeAgo(conv.lastMessageAt),
        unread,
      }
    }),
  )

  // Hide brand-new conversations that have no messages yet from the inbox.
  return summaries.filter((s) => s.lastMessage !== null)
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

  // Mark read up to now for whichever side the current user is on.
  await db
    .update(dmConversation)
    .set(conv.userAId === user.id ? { userALastReadAt: new Date() } : { userBLastReadAt: new Date() })
    .where(eq(dmConversation.id, conversationId))

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
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      attachmentUrl: m.attachmentUrl,
      attachmentType: (m.attachmentType as DmAttachmentType | null) ?? null,
      attachmentName: m.attachmentName,
      isSelf: m.senderId === user.id,
      postedAt: timeAgo(m.createdAt),
    })),
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
    .set(conv.userAId === user.id ? { userALastReadAt: new Date() } : { userBLastReadAt: new Date() })
    .where(eq(dmConversation.id, conversationId))

  return messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    body: m.body,
    attachmentUrl: m.attachmentUrl,
    attachmentType: (m.attachmentType as DmAttachmentType | null) ?? null,
    attachmentName: m.attachmentName,
    isSelf: m.senderId === user.id,
    postedAt: timeAgo(m.createdAt),
  }))
}

export async function sendDirectMessage(input: {
  conversationId: number
  body?: string
  attachmentUrl?: string | null
  attachmentType?: DmAttachmentType | null
  attachmentName?: string | null
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
  })

  // Bump ordering + mark the sender's side read.
  await db
    .update(dmConversation)
    .set({ lastMessageAt: new Date() })
    .where(eq(dmConversation.id, input.conversationId))

  revalidatePath(`/messages/${input.conversationId}`)
  revalidatePath("/messages")
}
