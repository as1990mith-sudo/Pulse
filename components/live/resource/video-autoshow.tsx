"use client"

// Realizes the "let's watch this together" behaviour: participants never have
// to open Resources or tap the video themselves. This invisible watcher is
// mounted once per live (inside the resource layer). It polls the room's shared
// video state and, the moment the host STARTS PLAYING a video, auto-opens the
// Video mini-panel on EVERY participant's screen. When the host stops the video
// it closes the panel again (unless the user has since opened a different one).
//
// Note it triggers on the *playing* transition, not merely on the host loading
// a source: loading leaves the video active-but-paused, and we deliberately
// stay out of the way until the host actually presses play. It reacts only to
// transitions, so it never fights a user who deliberately closed the panel or
// switched to another resource mid-video.

import { useEffect, useRef } from "react"
import useSWR from "swr"
import { getVideoState } from "@/app/actions/live-video-resource"
import { useLiveResources } from "./resource-context"

export function VideoAutoShow() {
  const { descriptor, activePanel, openPanel, closePanel } = useLiveResources()
  // The shared-video resource exists only on the audio surfaces (podcast &
  // audio conversation). On video broadcast/conversation there is no video
  // resource, so this watcher must never poll or auto-open anything.
  const roomName = descriptor?.mode === "audio" ? (descriptor?.roomName ?? null) : null

  // Light poll: enough to feel instant ("immediately appearing for everyone")
  // without hammering. The panel's own engine polls faster once it is open.
  const { data } = useSWR(
    roomName ? ["live-video-autoshow", roomName] : null,
    () => getVideoState(roomName as string),
    { refreshInterval: 2000, revalidateOnFocus: true },
  )

  const wasActive = useRef(false)
  const wasPlaying = useRef(false)
  const activePanelRef = useRef(activePanel)
  activePanelRef.current = activePanel

  useEffect(() => {
    const isActive = !!data?.active
    // Only consider it "playing" while a source is actually loaded, so a stale
    // playing flag can never open the panel without an active video.
    const isPlaying = isActive && !!data?.playing
    const wasA = wasActive.current
    const wasP = wasPlaying.current
    wasActive.current = isActive
    wasPlaying.current = isPlaying

    // Paused/loaded → playing: the host just pressed play. THIS is the moment
    // we bring the video up for everyone — not when they merely loaded a source.
    if (isPlaying && !wasP && activePanelRef.current !== "video") {
      openPanel("video")
      return
    }
    // Active → off: the host stopped the video entirely. Close the video panel
    // if it is the one showing; leave any other resource the user opened alone.
    if (!isActive && wasA && activePanelRef.current === "video") {
      closePanel()
    }
  }, [data?.active, data?.playing, openPanel, closePanel])

  return null
}
