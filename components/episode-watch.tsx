"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bookmark, ChevronDown, Heart, Loader2, Send, Share2 } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import type { Show } from "@/lib/data"
import type { CurrentUser } from "@/lib/session"
import type { EpisodeCommentView } from "@/app/actions/episodes"
import {
  addEpisodeComment,
  deleteEpisodeComment,
  editEpisodeComment,
  getEpisodeComments,
  isEpisodeLiked,
  setEpisodeCommentLike,
  setEpisodeLike,
} from "@/app/actions/episodes"
import { isItemSaved, toggleSaveItem } from "@/app/actions/share"
import { getEpisodeEngagement, type EpisodeEngagement } from "@/app/actions/engagement"
import { getFollowingIds } from "@/app/actions/follow"
import type { ShareTarget } from "@/lib/share-types"
import { EpisodePlayer } from "@/components/episode-player"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
import { ShareSheet } from "@/components/share-sheet"
import { VideoCard } from "@/components/profile/video-card"
import { ProfileFollowButton } from "@/components/profile/profile-follow-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function toThreadComment(c: EpisodeCommentView): ThreadComment {
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

/**
 * Immersive video watch page split into two independent sections:
 *
 *  • SECTION 1 (pinned) — the video player + its controls, title/uploader, and
 *    the Like / Comment / Save / Share action bar. This never scrolls.
 *  • SECTION 2 (scrollable) — everything below the action bar: the comment
 *    section (composer + thread), "More from…", and the About card.
 *
 * Only Section 2 scrolls; the top stays put. The Comment button toggles the
 * comments open/closed with a smooth height animation — when collapsed the whole
 * comment section is replaced by a compact "Comments (n) ▾" row and "More from…"
 * moves directly beneath it. The video can also be minimized into a floating
 * mini-player without pausing playback.
 */
export function EpisodeWatch({
  show,
  currentUser,
  initialComments,
  queue,
}: {
  show: Show
  currentUser: CurrentUser | null
  initialComments: EpisodeCommentView[]
  queue: Show[]
}) {
  const episodeId = show.episodeId
  const router = useRouter()

  const [minimized, setMinimized] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(true)

  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(show.likes ?? 0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState<EpisodeCommentView[]>(initialComments)
  const [draft, setDraft] = useState("")
  const [shareOpen, setShareOpen] = useState(false)
  const [engagement, setEngagement] = useState<EpisodeEngagement | null>(null)
  // Live save/share totals, shown inline next to their icons. Seeded from the
  // engagement summary once it loads.
  const [saveCount, setSaveCount] = useState(0)
  const [shareCount, setShareCount] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Follow state for the episode's host, used to seed the inline Follow button
  // in the action bar. Only relevant when signed in and viewing someone else.
  const hostIsSelf = currentUser?.id === show.host.id
  const [followKnown, setFollowKnown] = useState(false)
  const [hostFollowing, setHostFollowing] = useState(false)

  useEffect(() => {
    if (!currentUser || hostIsSelf) {
      setFollowKnown(false)
      return
    }
    let active = true
    getFollowingIds()
      .then((ids) => {
        if (!active) return
        setHostFollowing(ids.includes(show.host.id))
        setFollowKnown(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [currentUser, hostIsSelf, show.host.id])

  useEffect(() => {
    if (!currentUser || !episodeId) {
      setSaved(false)
      setLiked(false)
      return
    }
    let active = true
    isItemSaved("episode", String(episodeId))
      .then((s) => active && setSaved(s))
      .catch(() => {})
    isEpisodeLiked(episodeId)
      .then((l) => active && setLiked(l))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [currentUser, episodeId])

  // Full engagement summary for the stats line under the player.
  useEffect(() => {
    if (!episodeId) return
    let active = true
    getEpisodeEngagement(episodeId)
      .then((e) => {
        if (!active) return
        setEngagement(e)
        setSaveCount(e.saves)
        setShareCount(e.shares)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [episodeId])

  if (!episodeId) return null

  const shareTarget: ShareTarget = {
    type: "episode",
    key: String(episodeId),
    title: `${show.title} on Frequency`,
    subtitle: show.tagline,
    url: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/catalog",
    image: show.cover,
    downloadUrl: show.audioUrl ?? null,
    downloadKind: show.audioUrl ? "audio" : null,
  }

  function toggleLike() {
    if (!currentUser) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      await setEpisodeLike({ episodeId: episodeId!, liked: next })
    })
  }

  function toggleSave() {
    if (!currentUser) return
    const next = !saved
    setSaved(next)
    setSaveCount((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      try {
        const r = await toggleSaveItem(shareTarget)
        setSaved(r.saved)
      } catch {
        setSaved(!next)
        setSaveCount((n) => Math.max(0, n + (next ? -1 : 1)))
      }
    })
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !currentUser) return
    setDraft("")
    startTransition(async () => {
      await addEpisodeComment({ episodeId: episodeId!, text })
      setComments(await getEpisodeComments(episodeId!))
    })
  }

  const count = comments.length

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-background">
      {/* ============================= SECTION 1 — pinned ===================== */}
      <div className="relative shrink-0">
        {/* Video + controls + title/uploader (rendered edge-to-edge). */}
        <EpisodePlayer
          show={show}
          minimized={minimized}
          onMinimize={() => setMinimized(true)}
          onRestore={() => setMinimized(false)}
          onClose={() => {
            // Exit the watch page — return to wherever the viewer came from,
            // falling back to the catalog if there's no history entry.
            if (window.history.length > 1) router.back()
            else router.push("/catalog")
          }}
        />

        {/* Action bar — hidden while the player is collapsed to a mini-player. */}
        {!minimized && (
          <div className="border-b border-border/60 px-2 py-1.5 sm:px-4">
            {engagement && (
              <p className="px-2 pb-1.5 pt-0.5 text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">
                  {new Intl.NumberFormat("en", { notation: "compact" }).format(engagement.views)}
                </span>{" "}
                views
              </p>
            )}
            <div className="flex items-center gap-1">
              {/* Left: host avatar + inline Follow. Tapping the avatar opens the
                  creator's profile. Follow reuses the shared button so behavior
                  is unchanged; it only appears when signed in and viewing
                  someone else. */}
              <Link
                href={`/u/${show.host.id}`}
                className="tap-scale shrink-0"
                aria-label={`View ${show.host.name}'s profile`}
              >
                <Avatar className="size-9 ring-1 ring-border/60">
                  {show.host.avatar && <AvatarImage src={show.host.avatar || "/placeholder.svg"} alt={show.host.name} />}
                  <AvatarFallback className="text-xs">{show.host.name[0]}</AvatarFallback>
                </Avatar>
              </Link>
              {currentUser && !hostIsSelf && followKnown && (
                <ProfileFollowButton
                  targetUserId={show.host.id}
                  targetName={show.host.name}
                  initialFollowing={hostFollowing}
                  className="h-8 rounded-full px-3 text-xs"
                />
              )}

              {/* Right: engagement actions, pushed to the far edge. */}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={toggleLike}
                  disabled={!currentUser}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50",
                    liked ? "text-live" : "text-foreground",
                  )}
                  aria-pressed={liked}
                  aria-label="Like episode"
                >
                  <Heart className={cn("size-5", liked && "fill-current")} />
                  {likes > 0 && <span className="tabular-nums">{likes}</span>}
                </button>

                <button
                  onClick={() => setCommentsOpen((o) => !o)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary",
                    commentsOpen ? "text-primary" : "text-foreground",
                  )}
                  aria-expanded={commentsOpen}
                  aria-label={commentsOpen ? "Hide comments" : "Show comments"}
                >
                  <CommentIcon className="size-5" />
                  {count > 0 && <span className="tabular-nums">{count}</span>}
                </button>

                <button
                  onClick={toggleSave}
                  disabled={!currentUser}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50",
                    saved ? "text-primary" : "text-foreground",
                  )}
                  aria-pressed={saved}
                  aria-label={saved ? "Unsave episode" : "Save episode"}
                >
                  <Bookmark className={cn("size-5", saved && "fill-current")} />
                  <span className="tabular-nums">{saveCount > 0 ? saveCount : saved ? "Saved" : "Save"}</span>
                </button>

                <button
                  onClick={() => setShareOpen(true)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  aria-label="Share episode"
                >
                  <Share2 className="size-5" />
                  <span className="tabular-nums">{shareCount > 0 ? shareCount : "Share"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================= SECTION 2 — scrollable ==================== */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-6 px-4 py-4 pb-16 sm:px-6">
          {/* Comment toggle group — the compact row and the collapsible section are
              grouped so that when collapsed there's no stray gap before "More
              from…", which must sit directly beneath the compact row. */}
          <div>
            {/* Compact comments row — shown only while collapsed. Tapping it (or the
                Comment button above) re-expands the comments. */}
            {!commentsOpen && (
              <button
                type="button"
                onClick={() => setCommentsOpen(true)}
                className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3 text-sm font-semibold transition-colors hover:bg-secondary/60"
                aria-expanded={false}
              >
                <span>Comments{count > 0 && <span className="ml-1 text-muted-foreground">({count})</span>}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            )}

            {/* Collapsible comment section (composer + thread). Animates height via
                grid-template-rows so there are no layout jumps. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                commentsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
            <div className={cn("min-h-0 overflow-hidden", commentsOpen ? "opacity-100" : "opacity-0")}>
              <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
                {/* Header with a collapse affordance. */}
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    Comments{count > 0 && <span className="ml-1 text-muted-foreground">({count})</span>}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setCommentsOpen(false)}
                    className="tap-scale flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label="Hide comments"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>

                {/* Composer */}
                {currentUser ? (
                  <form onSubmit={submitComment} className="flex items-center gap-2">
                    <Avatar className="size-8">
                      <AvatarImage src={currentUser.image || undefined} alt="" />
                      <AvatarFallback style={{ backgroundColor: currentUser.color }} className="text-xs text-white">
                        {currentUser.initials}
                      </AvatarFallback>
                    </Avatar>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Add a comment…"
                      className="h-9 flex-1 rounded-full border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || isPending}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                      aria-label="Post comment"
                    >
                      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <Link href="/sign-in" className="font-medium text-primary hover:underline">
                      Sign in
                    </Link>{" "}
                    to like and comment.
                  </p>
                )}

                {/* Comments + replies */}
                <CommentThread
                  comments={comments.map(toThreadComment)}
                  canInteract={Boolean(currentUser)}
                  onLike={(commentId, liked) => void setEpisodeCommentLike({ commentId, liked })}
                  onReply={async (parentId, value) => {
                    await addEpisodeComment({ episodeId: episodeId!, text: value, parentId })
                    setComments(await getEpisodeComments(episodeId!))
                  }}
                  onEdit={async (commentId, value) => {
                    await editEpisodeComment({ commentId, text: value })
                    setComments(await getEpisodeComments(episodeId!))
                  }}
                  onDelete={async (commentId) => {
                    await deleteEpisodeComment(commentId)
                    setComments(await getEpisodeComments(episodeId!))
                  }}
                />
              </div>
            </div>
            </div>
          </div>

          {/* More from… (next / recommended videos) — sits directly beneath the
              comments (expanded) or the compact comments row (collapsed), per the
              spec. Everything else (creator card, About) follows below it. */}
          {queue.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">More from {show.host.name}</h2>
              <div className="flex flex-col gap-3">
                {queue.map((ep) => (
                  <VideoCard key={ep.id} show={ep} />
                ))}
              </div>
            </section>
          )}

          {/* Creator card */}
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
            <Avatar className="size-11">
              <AvatarFallback>{show.host.name[0]}</AvatarFallback>
            </Avatar>
            <Link href={`/u/${show.host.id}`} className="min-w-0">
              <p className="truncate font-semibold leading-none hover:underline">{show.host.name}</p>
              <p className="truncate text-sm text-muted-foreground">{show.host.handle}</p>
            </Link>
          </div>

          {/* About this episode */}
          {show.description && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-card p-5">
              <h2 className="text-sm font-semibold">About this episode</h2>
              <p className="whitespace-pre-wrap text-pretty leading-relaxed text-muted-foreground">{show.description}</p>
            </div>
          )}
        </div>
      </div>

      <ShareSheet
        target={shareTarget}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onShared={() => setShareCount((n) => n + 1)}
      />
    </div>
  )
}
