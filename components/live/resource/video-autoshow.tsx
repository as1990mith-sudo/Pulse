"use client"

// Realizes the "let's watch this together" behaviour: participants never have
// to open Resources or tap the video themselves. This invisible watcher is
// mounted once per live (inside the resource layer). It polls the room's shared
// video state and, the moment the host activates a video, auto-opens the Video
// mini-panel on EVERY participant's screen. When the host stops the video, it
// closes the panel again (unless the user has since opened a different one).
//
// It reacts only to the active/off TRANSITIONS, so it never fights a user who
// deliberately closed the panel or switched to another resource mid-video.

import { useEffect, useRef } from "react"
import useSWR from "swr"
import { getVideoState } from "@/app/actions/live-video-resource"
import { useLiveResources } from "./resource-context"

export function VideoAutoShow() {
  const { descriptor, activePanel, openPanel, closePanel } = useLiveResources()
  const roomName = descriptor?.roomName ?? null

  // Light poll: enough to feel instant ("immediately appearing for everyone")
  // without hammering. The panel's own engine polls faster once it is open.
  const { data } = useSWR(
    roomName ? ["live-video-autoshow", roomName] : null,
    () => getVideoState(roomName as string),
    { refreshInterval: 2000, revalidateOnFocus: true },
  )

  const wasActive = useRef(false)
  const activePanelRef = useRef(activePanel)
  activePanelRef.current = activePanel

  useEffect(() => {
    const isActive = !!data?.active
    const was = wasActive.current
    wasActive.current = isActive

    // Off → active: the host just started a video. Bring it up for everyone.
    if (isActive && !was && activePanelRef.current !== "video") {
      openPanel("video")
      return
    }
    // Active → off: the host stopped it. Close the video panel if it is the one
    // showing; leave any other resource the user opened alone.
    if (!isActive && was && activePanelRef.current === "video") {
      closePanel()
    }
  }, [data?.active, openPanel, closePanel])

  return null
}
