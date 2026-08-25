import type { FeedCommentView } from "@/app/actions/feed"
import type { ThreadComment } from "@/components/comment-thread"
import type { CurrentUser } from "@/lib/session"

/**
 * Adapts a feed comment into the shared CommentThread shape.
 *
 * The two types deliberately differ (`user`/`authorImage` on the wire vs
 * `name`/`image` in the UI), which makes a structural cast between them silently
 * wrong rather than a type error: the renamed fields land as `undefined`, so the
 * author's photo falls back to initials and their display name disappears. This
 * lives in one place so every surface showing feed comments — the inline card,
 * Reels, and the expanded media viewer — maps them identically instead of each
 * keeping its own copy to drift out of sync.
 */
export function toThreadComment(c: FeedCommentView): ThreadComment {
  return {
    id: c.id,
    parentId: c.parentId,
    authorId: c.authorId,
    isSelf: c.isSelf,
    name: c.user,
    handle: c.handle,
    initials: c.initials,
    color: c.color,
    image: c.authorImage,
    text: c.text,
    likes: c.likes,
    liked: c.liked,
    edited: c.edited,
    postedAt: c.postedAt,
    createdAtMs: c.createdAtMs,
  }
}

/** The organisation identity a comment can be posted under, when offered. */
export type OptimisticVoice = {
  name: string
  handle: string
  initials: string
  image: string | null
}

/**
 * Builds a placeholder comment from the current user so a new comment appears
 * the instant it is sent, rather than only after the server round-trip.
 *
 * `voice` carries the Home identity when an admin posts in the organisation's
 * name, so the optimistic row shows the same author the saved comment will —
 * otherwise it would flash the admin's personal name and then swap.
 */
export function makeOptimisticComment({
  currentUser,
  text,
  parentId = null,
  voice = null,
}: {
  currentUser: CurrentUser
  text: string
  parentId?: number | null
  voice?: OptimisticVoice | null
}): FeedCommentView {
  // Negative ids cannot collide with a real (positive, server-assigned) comment
  // id, so reconciling against the server list can never drop the wrong row.
  const id = -Date.now()
  return {
    id,
    parentId,
    authorId: currentUser.id,
    isSelf: true,
    user: voice?.name ?? currentUser.name,
    handle: voice?.handle ?? currentUser.handle,
    initials: voice?.initials ?? currentUser.initials,
    color: currentUser.color,
    authorImage: voice ? voice.image : currentUser.image,
    // Verification is a server-side fact we cannot know yet; showing an
    // unearned tick for a moment would be worse than showing none.
    orgVerified: false,
    text,
    likes: 0,
    liked: false,
    edited: false,
    postedAt: "Just now",
    createdAtMs: Date.now(),
  }
}
