import { notFound } from "next/navigation"
import { getLiveStream } from "@/app/actions/live"
import { getFollowingIds } from "@/app/actions/follow"
import { resolveShow } from "@/lib/content"
import { getCurrentUser } from "@/lib/session"
import { ListenerLauncher, HostStudioLauncher } from "@/components/live-session"
import { LiveVideoViewer } from "@/components/live-video-viewer"
import { EpisodePage } from "@/components/episode-page"

export default async function LiveStreamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const stream = await getLiveStream(id)

  // Not live? It may be a published, on-demand episode (looked up by slug).
  if (!stream) {
    const show = await resolveShow(id)
    if (!show) notFound()
    return <EpisodePage show={show} />
  }

  const currentUser = await getCurrentUser()

  // Video streams use the immersive, full-screen TikTok-style viewer.
  if (stream.mode === "video") {
    const followingIds = currentUser ? await getFollowingIds() : []
    return (
      <LiveVideoViewer
        stream={stream}
        canWatch={Boolean(currentUser)}
        currentUserId={currentUser?.id ?? null}
        initialFollowing={followingIds.includes(stream.hostId)}
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
      canListen={Boolean(currentUser)}
      currentUser={currentUser}
      currentUserId={currentUser?.id ?? null}
    />
  )
}
