// Home deletion retention + purge.
//
// This is deliberately a PLAIN server module, not a "use server" action file:
//
//   1. `"use server"` files may only export async functions, so the
//      HOME_RETENTION_DAYS constant cannot live in one. Exporting it from
//      app/actions/home.ts silently invalidated that entire module ("has no
//      exports at all"), which broke every import of it — including
//      setActiveHome — and 500'd the whole app.
//   2. More importantly, every async export of a "use server" file becomes a
//      CLIENT-CALLABLE endpoint. A permanent, irreversible purge of a Home's
//      data must never be reachable from the browser. Keeping it here means the
//      only callers are server-side: the scheduled job and the deletion flow.
import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  announcement,
  announcementInteraction,
  article,
  catalogueItem,
  chatroom,
  chatroomJoinRequest,
  chatroomMember,
  chatroomMessage,
  communityComment,
  communityPost,
  contentView,
  devotional,
  episode,
  episodeComment,
  event,
  eventRsvp,
  feedComment,
  feedPost,
  home,
  homeAppointment,
  homeAuthKey,
  homeBooking,
  homeMembership,
  liveBlocked,
  liveCallRequest,
  liveChatMessage,
  liveNote,
  livePresence,
  liveReaction,
  liveStream,
  notification,
  organization,
  repost,
  subscription,
} from "@/lib/db/schema"

/** How long a deleted Home's organisational content is retained before purge. */
export const HOME_RETENTION_DAYS = 30

/**
 * Permanently destroys one soft-deleted Home's organisational data.
 *
 * The critical distinction (requirement 17): content published AS the Home
 * belongs to the Home and dies with it, while content a member published under
 * their OWN identity belongs to that person and must survive. Those personal
 * posts are detached (homeId → null) rather than deleted, so they remain on
 * their author's profile and personal feed. Previously this selected every post
 * carrying the Home's id and deleted the lot, which destroyed members' personal
 * posts along with the organisation's.
 *
 * User rows are never touched: deleting a Home dissolves an organisation, not
 * the people in it.
 */
export async function purgeHomeData(homeId: string, orgId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    // --- Preserve members' personal content ---------------------------------
    // Detach BEFORE the delete pass so these rows can't be swept up by it.
    await tx
      .update(feedPost)
      .set({ homeId: null })
      .where(and(eq(feedPost.homeId, homeId), eq(feedPost.publishedAsType, "personal")))
    await tx
      .update(article)
      .set({ homeId: null, organizationId: null })
      .where(and(eq(article.homeId, homeId), eq(article.publishedAsType, "personal")))

    // --- Resolve the ids/room names of everything scoped to this Home --------
    const streams = await tx.select().from(liveStream).where(eq(liveStream.homeId, homeId))
    const roomNames = streams.map((s) => s.roomName)
    const streamIds = streams.map((s) => s.id)

    const episodeIds = (await tx.select({ id: episode.id }).from(episode).where(eq(episode.homeId, homeId))).map(
      (r) => r.id,
    )
    const chatroomIds = (await tx.select({ id: chatroom.id }).from(chatroom).where(eq(chatroom.homeId, homeId))).map(
      (r) => r.id,
    )
    const communityPostIds = (
      await tx.select({ id: communityPost.id }).from(communityPost).where(eq(communityPost.homeId, homeId))
    ).map((r) => r.id)
    // Only ORGANISATIONAL posts. Members' personal posts were detached above, so
    // they no longer carry this homeId and are correctly excluded here.
    const feedPostIds = (
      await tx
        .select({ id: feedPost.id })
        .from(feedPost)
        .where(orgId ? or(eq(feedPost.homeId, homeId), eq(feedPost.organizationId, orgId)) : eq(feedPost.homeId, homeId))
    ).map((r) => r.id)
    const announcementIds = (
      await tx
        .select({ id: announcement.id })
        .from(announcement)
        .where(
          orgId
            ? or(eq(announcement.homeId, homeId), eq(announcement.organizationId, orgId))
            : eq(announcement.homeId, homeId),
        )
    ).map((r) => r.id)

    // --- Live rooms (children keyed by roomName / streamId) -----------------
    if (roomNames.length > 0) {
      await tx.delete(liveChatMessage).where(inArray(liveChatMessage.roomName, roomNames))
      await tx.delete(livePresence).where(inArray(livePresence.roomName, roomNames))
      await tx.delete(liveReaction).where(inArray(liveReaction.roomName, roomNames))
      await tx.delete(liveCallRequest).where(inArray(liveCallRequest.roomName, roomNames))
      await tx.delete(liveBlocked).where(inArray(liveBlocked.roomName, roomNames))
    }
    if (streamIds.length > 0) await tx.delete(liveNote).where(inArray(liveNote.streamId, streamIds))
    await tx.delete(liveStream).where(eq(liveStream.homeId, homeId))

    // --- Episodes (incl. live replays) --------------------------------------
    if (episodeIds.length > 0) {
      await tx.delete(episodeComment).where(inArray(episodeComment.episodeId, episodeIds))
      await tx.delete(contentView).where(inArray(contentView.episodeId, episodeIds))
    }
    await tx.delete(episode).where(eq(episode.homeId, homeId))

    // --- Chatrooms ----------------------------------------------------------
    if (chatroomIds.length > 0) {
      await tx.delete(chatroomMessage).where(inArray(chatroomMessage.chatroomId, chatroomIds))
      await tx.delete(chatroomMember).where(inArray(chatroomMember.chatroomId, chatroomIds))
      await tx.delete(chatroomJoinRequest).where(inArray(chatroomJoinRequest.chatroomId, chatroomIds))
    }
    await tx.delete(chatroom).where(eq(chatroom.homeId, homeId))

    // --- Feed / community / announcements -----------------------------------
    if (feedPostIds.length > 0) {
      await tx.delete(feedComment).where(inArray(feedComment.postId, feedPostIds))
      await tx.delete(repost).where(inArray(repost.postId, feedPostIds))
      await tx.delete(feedPost).where(inArray(feedPost.id, feedPostIds))
    }
    if (communityPostIds.length > 0) {
      await tx.delete(communityComment).where(inArray(communityComment.postId, communityPostIds))
      await tx.delete(communityPost).where(inArray(communityPost.id, communityPostIds))
    }
    if (announcementIds.length > 0) {
      await tx.delete(eventRsvp).where(inArray(eventRsvp.announcementId, announcementIds))
      await tx.delete(announcementInteraction).where(inArray(announcementInteraction.announcementId, announcementIds))
      await tx.delete(announcement).where(inArray(announcement.id, announcementIds))
    }

    // --- Remaining Home-scoped rows ----------------------------------------
    await tx.delete(devotional).where(eq(devotional.homeId, homeId))
    await tx.delete(notification).where(eq(notification.homeId, homeId))
    await tx.delete(homeBooking).where(eq(homeBooking.homeId, homeId))
    await tx.delete(homeAppointment).where(eq(homeAppointment.homeId, homeId))
    await tx.delete(homeAuthKey).where(eq(homeAuthKey.homeId, homeId))
    await tx.delete(homeMembership).where(eq(homeMembership.homeId, homeId))

    // --- Organisation-scoped rows, then the Home + org themselves -----------
    if (orgId) {
      await tx.delete(catalogueItem).where(eq(catalogueItem.organizationId, orgId))
      await tx.delete(event).where(eq(event.organizationId, orgId))
      await tx.delete(subscription).where(eq(subscription.organizationId, orgId))
    }
    await tx.delete(home).where(eq(home.id, homeId))
    if (orgId) await tx.delete(organization).where(eq(organization.id, orgId))
  })
}

/**
 * Purges every Home whose retention window has elapsed. Safe to call repeatedly —
 * it only picks up Homes already past their `purgeAfter` stamp.
 */
export async function purgeExpiredHomes(): Promise<{ purged: number }> {
  const due = await db
    .select({ id: home.id, organizationId: home.organizationId })
    .from(home)
    .where(and(isNotNull(home.purgeAfter), lt(home.purgeAfter, new Date())))

  for (const row of due) {
    await purgeHomeData(row.id, row.organizationId)
  }
  return { purged: due.length }
}
