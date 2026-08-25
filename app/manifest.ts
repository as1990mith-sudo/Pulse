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
    // The sRGB value of the dark --background token (oklch(0.16 0.006 285)),
    // so the launch screen does not flash a lighter colour on the way in.
    background_color: "#0d0d10",
    theme_color: "#0d0d10",
    orientation: "portrait",
    icons: [
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        // Declared "any", NOT "maskable": the icon has no safe-zone padding, so
        // Android would crop into the artwork to fit its mask.
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  }
}
