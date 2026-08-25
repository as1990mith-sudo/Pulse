import type { MetadataRoute } from "next"

/**
 * Web app manifest.
 *
 * Not cosmetic: iOS only grants Notification permission to a site the user has
 * added to their home screen, and it only offers that install path when a valid
 * manifest with `display: standalone` is present. Without this file, push is
 * simply unavailable to every iPhone user.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frequency",
    short_name: "Frequency",
    description:
      "Go live, build your audience, and stream audio + video podcasts in real time. Listen in, chat, and call in to the conversation.",
    start_url: "/",
    display: "standalone",
    // Matches the --background token so the launch screen does not flash white
    // on the way into a dark app.
    background_color: "#161618",
    theme_color: "#161618",
    orientation: "portrait",
    icons: [
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  }
}
