"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getAdminUser } from "@/lib/admin"
import { db } from "@/lib/db"
import { dream, dreamReply, user as userTable } from "@/lib/db/schema"
import { getAvatarColor, getHandle, getInitials } from "@/lib/identity"
import { EDIT_WINDOW_MS } from "@/lib/interactions"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export type DreamView = {
  id: number
  body: string
  postedAt: string
  createdAtMs: number
  edited: boolean
  replyCount: number
  // True when the signed-in user authored this dream.
  isSelf: boolean
  // Sender identity — populated ONLY for the author themselves and for the
  // admin (who runs the interpretation inbox). Null for everyone else so dreams
  // stay anonymous to the wider community.
  senderName: string | null
  senderHandle: string | null
  senderInitials: string | null
  senderColor: string | null
  senderImage: string | null
}

export type DreamReplyView = {
  id: number
  body: string
  likes: number
  edited: boolean
  postedAt: string
  createdAtMs: number
  adminName: string
  adminInitials: string
  adminColor: string
  adminImage: string | null
}

export type DreamFeed = {
  isAdmin: boolean
  dreams: DreamView[]
}

/** Newest-first feed of anonymous dreams + reply counts. */
export async function getDreams(): Promise<DreamFeed> {
  const session = await auth.api.getSession({ headers: await headers() })
  const viewerId = session?.user?.id ?? null
  const admin = await getAdminUser()
  const isAdmin = !!admin

  const rows = await db
    .select()
    .from(dream)
    .where(eq(dream.deleted, false))
    .orderBy(desc(dream.createdAt))
    .limit(200)

  const ids = rows.map((d) => d.id)
  const countMap = new Map<number, number>()
  if (ids.length) {
    const replies = await db
      .select({ dreamId: dreamReply.dreamId })
      .from(dreamReply)
      .where(and(inArray(dreamReply.dreamId, ids), eq(dreamReply.deleted, false)))
    for (const r of replies) countMap.set(r.dreamId, (countMap.get(r.dreamId) ?? 0) + 1)
  }

  // Resolve avatars for any sender we're allowed to de-anonymize (the admin sees
  // every sender; a regular viewer only ever sees themselves).
  const imageMap = new Map<string, string | null>()
  const revealIds = isAdmin
    ? [...new Set(rows.map((d) => d.userId))]
    : viewerId
      ? [...new Set(rows.filter((d) => d.userId === viewerId).map((d) => d.userId))]
      : []
  if (revealIds.length) {
    const users = await db
      .select({ id: userTable.id, image: userTable.image })
      .from(userTable)
      .where(inArray(userTable.id, revealIds))
    for (const u of users) imageMap.set(u.id, u.image ?? null)
  }

  const dreams = rows.map((d) => {
    const isSelf = viewerId === d.userId
    const reveal = isAdmin || isSelf
    return {
      id: d.id,
      body: d.body,
      postedAt: timeAgo(d.createdAt),
      createdAtMs: d.createdAt.getTime(),
      edited: !!d.editedAt,
      replyCount: countMap.get(d.id) ?? 0,
      isSelf,
      senderName: reveal ? d.userName : null,
      senderHandle: reveal ? getHandle(d.userName) : null,
      senderInitials: reveal ? getInitials(d.userName) : null,
      senderColor: reveal ? getAvatarColor(d.userId) : null,
      senderImage: reveal ? (imageMap.get(d.userId) ?? null) : null,
    }
  })

  return { isAdmin, dreams }
}

/** Shares a dream anonymously into the Dream Interpretation room. */
export async function createDream(body: string): Promise<DreamView> {
  const user = await requireUser()
  const text = body.trim()
  if (!text) throw new Error("Your dream can't be empty.")
  if (text.length > 2000) throw new Error("Please keep it under 2000 characters.")

  const [row] = await db.insert(dream).values({ userId: user.id, userName: user.name, body: text }).returning()

  revalidatePath("/chatrooms/dreams")
  return {
    id: row.id,
    body: row.body,
    postedAt: "now",
    createdAtMs: row.createdAt.getTime(),
    edited: false,
    replyCount: 0,
    isSelf: true,
    senderName: user.name,
    senderHandle: getHandle(user.name),
    senderInitials: getInitials(user.name),
    senderColor: getAvatarColor(user.id),
    senderImage: user.image ?? null,
  }
}

/** Author-only edit of their own dream. Returns the new body. */
export async function editDream(input: { dreamId: number; body: string }): Promise<string> {
  const user = await requireUser()
  const text = input.body.trim()
  if (!text) throw new Error("Your dream can't be empty.")
  if (text.length > 2000) throw new Error("Please keep it under 2000 characters.")

  const [row] = await db.select().from(dream).where(eq(dream.id, input.dreamId))
  if (!row || row.deleted) throw new Error("This dream no longer exists.")
  if (row.userId !== user.id) throw new Error("You can only edit your own dream.")

  await db.update(dream).set({ body: text, editedAt: new Date() }).where(eq(dream.id, input.dreamId))
  revalidatePath("/chatrooms/dreams")
  return text
}

/** Author (or admin) soft-deletes a dream. */
export async function deleteDream(dreamId: number) {
  const user = await requireUser()
  const admin = await getAdminUser()
  const [row] = await db.select().from(dream).where(eq(dream.id, dreamId))
  if (!row) throw new Error("Dream not found.")
  if (row.userId !== user.id && !admin) throw new Error("You can only delete your own dream.")
  await db.update(dream).set({ deleted: true }).where(eq(dream.id, dreamId))
  revalidatePath("/chatrooms/dreams")
}

/** All admin interpretations for a dream, oldest-first. */
export async function getDreamReplies(dreamId: number): Promise<DreamReplyView[]> {
  const rows = await db
    .select()
    .from(dreamReply)
    .where(and(eq(dreamReply.dreamId, dreamId), eq(dreamReply.deleted, false)))
    .orderBy(asc(dreamReply.createdAt))

  const imageMap = new Map<string, string | null>()
  const adminIds = [...new Set(rows.map((r) => r.adminId))]
  if (adminIds.length) {
    const users = await db
      .select({ id: userTable.id, image: userTable.image })
      .from(userTable)
      .where(inArray(userTable.id, adminIds))
    for (const u of users) imageMap.set(u.id, u.image ?? null)
  }

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    likes: r.likes,
    edited: !!r.editedAt,
    postedAt: timeAgo(r.createdAt),
    createdAtMs: r.createdAt.getTime(),
    adminName: r.adminName,
    adminInitials: getInitials(r.adminName),
    adminColor: getAvatarColor(r.adminId),
    adminImage: imageMap.get(r.adminId) ?? null,
  }))
}

/** Admin-only: posts an interpretation that surfaces as a comment under the dream. */
export async function addDreamReply(input: { dreamId: number; body: string }): Promise<DreamReplyView> {
  const admin = await getAdminUser()
  if (!admin) throw new Error("Only the interpreter can reply to dreams.")
  const text = input.body.trim()
  if (!text) throw new Error("Your interpretation can't be empty.")
  if (text.length > 2000) throw new Error("Please keep it under 2000 characters.")

  const [target] = await db.select().from(dream).where(eq(dream.id, input.dreamId))
  if (!target || target.deleted) throw new Error("This dream no longer exists.")

  const [row] = await db
    .insert(dreamReply)
    .values({ dreamId: input.dreamId, adminId: admin.id, adminName: admin.name, body: text })
    .returning()

  const [profile] = await db.select({ image: userTable.image }).from(userTable).where(eq(userTable.id, admin.id))

  revalidatePath("/chatrooms/dreams")
  return {
    id: row.id,
    body: row.body,
    likes: 0,
    edited: false,
    postedAt: "now",
    createdAtMs: row.createdAt.getTime(),
    adminName: admin.name,
    adminInitials: getInitials(admin.name),
    adminColor: getAvatarColor(admin.id),
    adminImage: profile?.image ?? null,
  }
}

/** Admin-only edit of an interpretation, within the edit window. */
export async function editDreamReply(input: { replyId: number; body: string }): Promise<string> {
  const admin = await getAdminUser()
  if (!admin) throw new Error("Only the interpreter can edit replies.")
  const text = input.body.trim()
  if (!text) throw new Error("Your interpretation can't be empty.")
  if (text.length > 2000) throw new Error("Please keep it under 2000 characters.")

  const [row] = await db.select().from(dreamReply).where(eq(dreamReply.id, input.replyId))
  if (!row || row.deleted) throw new Error("This interpretation no longer exists.")
  if (Date.now() - row.createdAt.getTime() > EDIT_WINDOW_MS) throw new Error("This reply can no longer be edited.")

  await db.update(dreamReply).set({ body: text, editedAt: new Date() }).where(eq(dreamReply.id, input.replyId))
  revalidatePath("/chatrooms/dreams")
  return text
}

/** Admin-only soft delete of an interpretation. */
export async function deleteDreamReply(replyId: number) {
  const admin = await getAdminUser()
  if (!admin) throw new Error("Only the interpreter can delete replies.")
  await db.update(dreamReply).set({ deleted: true }).where(eq(dreamReply.id, replyId))
  revalidatePath("/chatrooms/dreams")
}

/** Toggle a like on an interpretation. Available to every signed-in member. */
export async function setDreamReplyLike(input: { replyId: number; liked: boolean }) {
  await requireUser()
  const [row] = await db.select({ likes: dreamReply.likes }).from(dreamReply).where(eq(dreamReply.id, input.replyId))
  if (!row) return
  const next = Math.max(0, row.likes + (input.liked ? 1 : -1))
  await db.update(dreamReply).set({ likes: next }).where(eq(dreamReply.id, input.replyId))
  revalidatePath("/chatrooms/dreams")
}
