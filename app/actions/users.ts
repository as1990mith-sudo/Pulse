"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { searchUsers, type ProfileSummary } from "@/lib/profile"
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
