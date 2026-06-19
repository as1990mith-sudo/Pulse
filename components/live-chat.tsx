"use client"

import { useEffect, useRef, useState } from "react"
import { Send } from "lucide-react"
import { type ChatMessage, chatPool, seedChat } from "@/lib/data"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

const randomNames = ["echo_22", "lunar", "deepcut", "mara", "tunein_tom", "frequency_fan", "night_owl", "vinyl_kid"]
const colors = ["text-chart-2", "text-chart-3", "text-chart-1"]

export function LiveChat({ asHost = false }: { asHost?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>(seedChat)
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Simulate incoming chat messages
  useEffect(() => {
    const interval = setInterval(
      () => {
        const text = chatPool[Math.floor(Math.random() * chatPool.length)]
        const user = randomNames[Math.floor(Math.random() * randomNames.length)]
        const color = colors[Math.floor(Math.random() * colors.length)]
        setMessages((prev) => [...prev.slice(-40), { id: crypto.randomUUID(), user, color, text }])
      },
      2600 + Math.random() * 2200,
    )
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  function send(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setMessages((prev) => [
      ...prev.slice(-40),
      {
        id: crypto.randomUUID(),
        user: asHost ? "Maya" : "you",
        color: asHost ? "text-primary" : "text-foreground",
        text,
        host: asHost,
      },
    ])
    setDraft("")
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col gap-2.5 p-4">
          {messages.map((m) => (
            <div key={m.id} className="text-sm leading-relaxed">
              <span className={cn("font-semibold", m.color)}>{m.user}</span>
              {m.host && (
                <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Host
                </span>
              )}
              <span className="ml-2 text-foreground/90">{m.text}</span>
            </div>
          ))}
        </div>
      </ScrollArea>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border/60 p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={asHost ? "Say something to the room…" : "Send a message…"}
          className="h-10"
          aria-label="Chat message"
        />
        <Button type="submit" size="icon" className="size-10 shrink-0" disabled={!draft.trim()}>
          <Send className="size-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </form>
    </div>
  )
}
