import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

function detectType(mime: string): "image" | "video" | "document" {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  return "document"
}

// Chat media upload (images, videos, documents) for signed-in users. Used by
// chatroom messages and chatroom group profile pictures.
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "You must be signed in to upload." }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large (max 50 MB)." }, { status: 400 })
    }

    const blob = await put(`chat/${Date.now()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    })

    return NextResponse.json({
      url: blob.url,
      type: detectType(file.type),
      name: file.name,
    })
  } catch (error) {
    console.error("[v0] Chat upload error:", error)
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 })
  }
}
