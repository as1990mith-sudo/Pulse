"use client"

import { Smile } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// A curated set of chat-friendly emoji, grouped loosely (smileys, gestures,
// hearts, faith/celebration, symbols). Kept intentionally compact so the picker
// stays a quick tap target rather than a full unicode browser.
const EMOJIS = [
  "😀", "😁", "😂", "🤣", "🙂", "😊", "😇", "🥰",
  "😍", "😎", "🤩", "😘", "😌", "🤔", "😅", "😴",
  "😢", "😭", "😡", "😳", "🥳", "😔", "😬", "🙄",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👋",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🔥", "💯",
  "✨", "🎉", "🎶", "⭐", "🌟", "💡", "✅", "❌",
  "🕊️", "✝️", "📖", "🙏", "😇", "⛪", "🌿", "☀️",
] as const

/**
 * Reusable emoji picker used by every chat composer. Built on the Radix
 * dropdown primitive so it portals out of the composer (positioning + outside
 * click handled for us) and floats ABOVE the input instead of pushing the chat
 * layout — the reason the previous inline grid was removed. Tapping an emoji
 * inserts it via `onSelect` and keeps the menu open so several can be added in
 * a row; tapping the trigger again or anywhere outside dismisses it.
 */
export function EmojiPicker({
  onSelect,
  immersive = false,
  className,
  iconClassName,
  side = "top",
  align = "start",
  ariaLabel = "Insert emoji",
}: {
  onSelect: (emoji: string) => void
  immersive?: boolean
  /** Classes for the trigger button, so each composer keeps its own look. */
  className?: string
  iconClassName?: string
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  ariaLabel?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
          immersive
            ? "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white data-[state=open]:bg-primary/25 data-[state=open]:text-primary"
            : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground data-[state=open]:bg-primary/15 data-[state=open]:text-primary",
          className,
        )}
      >
        <Smile className={cn("size-5", iconClassName)} />
      </DropdownMenuTrigger>
      {/* Inline width defeats the menu's default `w-(--anchor-width)` (which
          would shrink the panel to the tiny trigger button). */}
      <DropdownMenuContent side={side} align={align} style={{ width: "min(20rem, 92vw)" }} className="p-2">

        <div className="grid grid-cols-8 gap-0.5">
          {EMOJIS.map((emoji, i) => (
            <button
              // Emoji repeat across groups (🙏, 😇), so index-qualify the key.
              key={`${emoji}-${i}`}
              type="button"
              onClick={() => onSelect(emoji)}
              aria-label={`Insert ${emoji}`}
              className="flex size-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-110 hover:bg-secondary active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
