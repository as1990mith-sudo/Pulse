"use server"

import { asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { devotionalComment } from "@/lib/db/schema"
import { getAvatarColor, getInitials } from "@/lib/identity"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to comment.")
  return session.user
}

export type DevotionalCommentView = {
  id: number
  user: string
  initials: string
  color: string
  text: string
  postedAt: string
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "Just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export async function getDevotionalComments(devotionalDate: string): Promise<DevotionalCommentView[]> {
  const rows = await db
    .select()
    .from(devotionalComment)
    .where(eq(devotionalComment.devotionalDate, devotionalDate))
    .orderBy(asc(devotionalComment.createdAt))

  return rows.map((c) => ({
    id: c.id,
    user: c.authorName,
    initials: getInitials(c.authorName),
    color: getAvatarColor(c.userId),
    text: c.text,
    postedAt: timeAgo(c.createdAt),
  }))
}

export async function addDevotionalComment(input: { devotionalDate: string; text: string }) {
  const user = await requireUser()
  const text = input.text.trim()
  if (!text) throw new Error("Comment cannot be empty.")

  await db.insert(devotionalComment).values({
    devotionalDate: input.devotionalDate,
    userId: user.id,
    authorName: user.name,
    text,
  })
  revalidatePath("/devotional")
}
