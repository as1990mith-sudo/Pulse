import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The single comment icon used across every comment surface in the app —
 * Reels, Devotional, Community Help, Dream Interpretation, episodes, feed
 * posts, notifications, and the shared comment thread's Reply button.
 *
 * It's a round chat bubble (lucide `MessageCircle`) mirrored horizontally so
 * the bubble's tail points toward the bottom-right, matching the look the
 * designer approved in the Reels comment sheet. Keeping it in one place means
 * every comment control stays visually identical.
 *
 * Drop-in replacement for a lucide icon: forwards `className` and all other
 * icon props (size via `className="size-N"`, `strokeWidth`, etc.).
 */
export function CommentIcon({ className, ...props }: React.ComponentProps<typeof MessageCircle>) {
  return <MessageCircle className={cn("-scale-x-100", className)} {...props} />
}
