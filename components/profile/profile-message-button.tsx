"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle } from "lucide-react"
import { getOrCreateConversation } from "@/app/actions/dm"
import { Button } from "@/components/ui/button"

export function ProfileMessageButton({
  targetUserId,
  targetName,
}: {
  targetUserId: string
  targetName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const conversationId = await getOrCreateConversation(targetUserId)
      router.push(`/messages/${conversationId}`)
    })
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onClick}
      disabled={isPending}
      className="gap-1.5"
      aria-label={`Message ${targetName}`}
    >
      <MessageCircle className="size-4" />
      {isPending ? "Opening…" : "Message"}
    </Button>
  )
}
