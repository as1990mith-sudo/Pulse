// Loads the YouTube IFrame Player API exactly once and resolves with the global
// `YT` namespace. The synchronised live-video resource uses this to create a
// controllable player (programmatic play/pause/seek) rather than a plain embed,
// which is what lets every participant follow the host's transport in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */

let apiPromise: Promise<any> | null = null

export function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is browser-only"))
  }
  const w = window as any
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise<any>((resolve) => {
    // The API calls this global once it has finished loading. Chain any existing
    // handler so we never clobber another consumer on the page.
    const previous = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous()
      resolve(w.YT)
    }
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script")
      tag.id = "youtube-iframe-api"
      tag.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(tag)
    }
  })
  return apiPromise
}
