import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

// Background music upload for live sessions. Available to any signed-in host so
// they can play a backing track while broadcasting (like Podbean's live music).
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
    if (!file.type.startsWith("audio/")) {
      return NextResponse.json({ error: "Please choose an audio file" }, { status: 400 })
    }

    const blob = await put(`live-music/${Date.now()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    })

    return NextResponse.json({ url: blob.url, name: file.name })
  } catch (error) {
    console.error("[v0] Audio upload error:", error)
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 })
  }
}
