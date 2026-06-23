"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle } from "lucide-react"
import { getOrCreateConversation } from "@/app/actions/dm"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

export function ProfileMessageButton({
  targetUserId,
  targetName,
  className,
  variant = "secondary",
}: {
  targetUserId: string
  targetName: string
  className?: string
  variant?: ComponentProps<typeof Button>["variant"]
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
      variant={variant}
      onClick={onClick}
      disabled={isPending}
      className={cn("gap-1.5", className)}
      aria-label={`Message ${targetName}`}
    >
      <MessageCircle className="size-4" />
      {isPending ? "Opening…" : "Message"}
    </Button>
  )
}
