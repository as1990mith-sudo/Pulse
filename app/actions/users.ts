"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getProfile, searchUsers, type Profile, type ProfileSummary } from "@/lib/profile"
import { getHandle } from "@/lib/identity"
import {
  announcement,
  chatroom,
  chatroomJoinRequest,
  chatroomMember,
  chatroomMessage,
  devotionalComment,
  dmCall,
  episode,
  episodeComment,
  feedComment,
  feedPost,
  liveCallRequest,
  liveChatMessage,
  liveStream,
  notification,
  statusUpdate,
  statusView,
  user as userTable,
} from "@/lib/db/schema"

/** Server action: search users by name for the header search box. */
export async function searchUsersAction(query: string): Promise<ProfileSummary[]> {
  return searchUsers(query)
}

/** Max number of words allowed in a profile bio. */
const BIO_MAX_WORDS = 25

/** Counts whitespace-delimited words in a string. */
function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Server action: save the signed-in user's profile bio. Bios are limited to
 * BIO_MAX_WORDS words; passing an empty string clears the bio. Returns the
 * normalized (trimmed) bio so the client can sync its local state.
 */
export async function updateBio(
  bio: string,
): Promise<{ ok: true; bio: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false, error: "You must be signed in to do that." }

  const trimmed = bio.trim()
  if (countWords(trimmed) > BIO_MAX_WORDS) {
    return { ok: false, error: `Your bio can be at most ${BIO_MAX_WORDS} words.` }
  }

  await db
    .update(userTable)
    .set({ bio: trimmed.length > 0 ? trimmed : null })
    .where(eq(userTable.id, session.user.id))

  revalidatePath(`/u/${session.user.id}`)
  return { ok: true, bio: trimmed }
}

/**
 * Server action: load a compact public profile for the hover/tap preview
 * popover (live chat, etc.). Returns null if the user no longer exists.
 */
export async function getProfilePreview(userId: string): Promise<Profile | null> {
  return getProfile(userId)
}

/**
 * Propagates the signed-in user's *current* display name to every place their
 * name (or derived handle) was denormalized at write time. Call this after a
 * successful name change so past posts, comments, chatroom messages, DMs calls,
 * statuses, notifications, etc. all show the new username.
 *
 * The name is read from the source-of-truth `user` row (already updated by
 * Better Auth), so this can't be used to spoof another identity.
 */
export async function syncUserDisplayName() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  const userId = session.user.id

  const [row] = await db.select({ name: userTable.name }).from(userTable).where(eq(userTable.id, userId))
  if (!row) return
  const name = row.name
  const handle = getHandle(name)

  // Each table stores the author/sender/owner identity under a different
  // column; update them all in parallel, scoped to this user's id.
  await Promise.all([
    db.update(feedPost).set({ authorName: name, authorHandle: handle }).where(eq(feedPost.userId, userId)),
    db.update(feedComment).set({ authorName: name, authorHandle: handle }).where(eq(feedComment.userId, userId)),
    db.update(devotionalComment).set({ authorName: name }).where(eq(devotionalComment.userId, userId)),
    db.update(episode).set({ hostName: name, hostHandle: handle }).where(eq(episode.hostUserId, userId)),
    db.update(episodeComment).set({ authorName: name, authorHandle: handle }).where(eq(episodeComment.userId, userId)),
    db.update(chatroom).set({ ownerName: name }).where(eq(chatroom.ownerId, userId)),
    db.update(chatroomMember).set({ userName: name }).where(eq(chatroomMember.userId, userId)),
    db.update(chatroomMessage).set({ userName: name }).where(eq(chatroomMessage.userId, userId)),
    db.update(chatroomJoinRequest).set({ userName: name }).where(eq(chatroomJoinRequest.userId, userId)),
    db.update(announcement).set({ creatorName: name }).where(eq(announcement.userId, userId)),
    db.update(statusUpdate).set({ authorName: name }).where(eq(statusUpdate.userId, userId)),
    db.update(statusView).set({ viewerName: name }).where(eq(statusView.viewerId, userId)),
    db.update(liveStream).set({ hostName: name, hostHandle: handle }).where(eq(liveStream.hostId, userId)),
    db.update(liveCallRequest).set({ userName: name }).where(eq(liveCallRequest.userId, userId)),
    db.update(liveChatMessage).set({ userName: name }).where(eq(liveChatMessage.userId, userId)),
    db.update(notification).set({ actorName: name }).where(eq(notification.actorId, userId)),
    db.update(dmCall).set({ callerName: name }).where(eq(dmCall.callerId, userId)),
  ])

  // Refresh the surfaces that render these denormalized names.
  revalidatePath("/feed")
  revalidatePath("/chatrooms")
  revalidatePath("/messages")
  revalidatePath(`/u/${userId}`)
}
