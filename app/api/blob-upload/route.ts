import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { type NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

// Client-side upload token endpoint. The browser uploads the file straight to
// Vercel Blob (bypassing the ~4.5 MB serverless request-body limit that broke
// large photo/video uploads), and only exchanges small JSON payloads with this
// route to get a signed token and to be notified when the upload completes.
//
// All media buckets (chat attachments, status media, covers, avatars, live
// background music, episode audio) funnel through here. The `pathname` the
// client requests is used as the blob key prefix, so we validate it against an
// allow-list and only let signed-in users upload.

const ALLOWED_PREFIXES = ["chat/", "status/", "covers/", "avatars/", "live-music/", "episodes/", "dm/", "store/", "pinned/", "community/", "catalogue/", "live-video/"] as const

// Document buckets (store product files, host-pinned live documents, org
// catalogue uploads) accept PDFs/EPUBs in addition to media; everything else is
// media only. The catalogue bucket holds audio files, cover images AND
// documents, so it needs the permissive document content types.
const DOCUMENT_CONTENT_TYPES = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/epub+zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]
const DOCUMENT_PREFIXES = ["store/", "pinned/", "catalogue/"]

// Generous ceilings per kind. Videos/audio are large; images are small.
const MAX_BYTES = 200 * 1024 * 1024 // 200 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Only signed-in users may upload.
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
          throw new Error("You must be signed in to upload.")
        }

        const allowed = ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
        if (!allowed) {
          throw new Error("Invalid upload path.")
        }

        return {
          allowedContentTypes: DOCUMENT_PREFIXES.some((p) => pathname.startsWith(p))
            ? DOCUMENT_CONTENT_TYPES
            : ["image/*", "video/*", "audio/*"],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_BYTES,
          // Surface the uploader so onUploadCompleted can attribute the file.
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        }
      },
      onUploadCompleted: async () => {
        // No server-side bookkeeping needed — the client persists the returned
        // URL via the relevant server action (createStatus, sendMessage, etc.).
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
