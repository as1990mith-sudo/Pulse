import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getLiveStream } from "@/app/actions/live"
import { shareMetadataToNext } from "@/lib/share/route-metadata"
import { getFollowingIds } from "@/app/actions/follow"
import { resolveShow } from "@/lib/content"
import { getCurrentUser } from "@/lib/session"
import {
  ListenerLauncher,
  HostStudioLauncher,
  HostVideoStudioLauncher,
  VideoViewerLauncher,
  HostConversationLauncher,
  ConversationParticipantLauncher,
} from "@/components/live-session"
import { EpisodePage } from "@/components/episode-page"
import { LiveFinishedScreen } from "@/components/live/live-finished-screen"

// Rich link preview: dynamic Open Graph / Twitter / canonical metadata for a
// live broadcast or an on-demand audio/video replay (spec §3). The resolver
// looks up the live stream (by roomName) or the episode (by slug) and picks the
// precise content type — live / audio / video — automatically.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return shareMetadataToNext({ type: "live", id })
}

export default async function LiveStreamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const stream = await getLiveStream(id)

  // Not live? It may be a published, on-demand episode (looked up by slug).
  if (!stream) {
    const show = await resolveShow(id)
    // No live and no on-demand episode: the session has almost certainly ended
    // (this route only ever serves live/episode content). Show a warm, on-brand
    // "live has finished" screen instead of a bare 404 error page.
    if (!show) return <LiveFinishedScreen />
    // Private episodes are visible only to their host (the owner).
    if (show.isPrivate) {
      const viewer = await getCurrentUser()
      if (!viewer || viewer.id !== show.host.id) notFound()
    }
    return <EpisodePage show={show} />
  }

  const currentUser = await getCurrentUser()

  // A PUBLIC live grants access to the Live itself — never the organisation's
  // Home — so a visitor with the link may enter with just a display name (no
  // account, no membership). A PRIVATE live stays members-only. The entry gate
  // below therefore admits everyone for a public live and only signed-in users
  // for a private one; joinBroadcast performs the authoritative membership check
  // and the room renders the display-name gate for public guests.
  const isPublic = stream.visibility === "public"

  // Video streams: the host resumes the studio as publisher; everyone else
  // joins the redesigned multi-guest video viewer. Both are mounted at the app
  // level so the room can be minimised into a persistent mini-player.
  if (stream.mode === "video") {
    if (currentUser && currentUser.id === stream.hostId) {
      return <HostVideoStudioLauncher currentUser={currentUser} resumeStream={stream} />
    }
    const followingIds = currentUser ? await getFollowingIds() : []
    return (
      <VideoViewerLauncher
        stream={stream}
        canWatch={Boolean(currentUser) || isPublic}
        currentUser={currentUser}
        currentUserId={currentUser?.id ?? null}
        initialFollowing={followingIds.includes(stream.hostId)}
      />
    )
  }

  // Conversation audio rooms: everyone (host + participants) shares the same
  // community-gathering room UI, with host-only controls gated by role. The
  // host resumes as the room owner; others join as speaking participants.
  if (stream.layout === "conversation") {
    if (currentUser && currentUser.id === stream.hostId) {
      return <HostConversationLauncher currentUser={currentUser} resumeStream={stream} />
    }
    return (
      <ConversationParticipantLauncher
        stream={stream}
        canJoin={Boolean(currentUser) || isPublic}
        currentUser={currentUser}
        currentUserId={currentUser?.id ?? null}
      />
    )
  }

  // The host returning to their own live room (e.g. after signing back in)
  // resumes the host studio as a publisher — never gets demoted to a listener.
  if (currentUser && currentUser.id === stream.hostId) {
    return <HostStudioLauncher currentUser={currentUser} resumeStream={stream} />
  }

  // Audio rooms are hosted at the app level (see LiveSessionProvider) as an
  // immersive full-screen room on every breakpoint, so they can be minimised
  // into a persistent mini-player while audio keeps playing. This route just
  // mounts the session into that provider.
  return (
    <ListenerLauncher
      stream={stream}
      canListen={Boolean(currentUser) || isPublic}
      currentUser={currentUser}
      currentUserId={currentUser?.id ?? null}
    />
  )
}
