import { redirect } from "next/navigation"
import { joinByInviteCode } from "@/app/actions/chatroom"
import { getCurrentUser } from "@/lib/session"

export default async function JoinByInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect(`/sign-in?redirect=/chatrooms/join/${encodeURIComponent(code)}`)
  }

  let target = "/chatrooms?invite=invalid"
  try {
    const roomId = await joinByInviteCode(code)
    target = `/chatrooms/${roomId}`
  } catch {
    target = "/chatrooms?invite=invalid"
  }

  redirect(target)
}
