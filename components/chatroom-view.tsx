"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Check, Copy, LogOut, Send, Users, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  approveJoinRequest,
  leaveChatroom,
  rejectJoinRequest,
  sendChatMessage,
  type ChatroomDetail,
} from "@/app/actions/chatroom"

export function ChatroomView({ detail }: { detail: ChatroomDetail }) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [showMembers, setShowMembers] = useState(false)
  const [isSending, startSend] = useTransition()
  const [isLeaving, startLeave] = useTransition()
  const scrollEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [detail.messages.length])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft("")
    startSend(async () => {
      await sendChatMessage({ chatroomId: detail.id, body })
      router.refresh()
    })
  }

  function handleLeave() {
    startLeave(async () => {
      await leaveChatroom(detail.id)
      router.push("/chatrooms")
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/chatrooms"
            aria-label="Back to chatrooms"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{detail.name}</h1>
              {detail.isOwner && <Badge variant="secondary">Admin</Badge>}
            </div>
            <button
              onClick={() => setShowMembers((s) => !s)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Users className="size-3" /> {detail.members.length}{" "}
              {detail.members.length === 1 ? "member" : "members"}
            </button>
          </div>
        </div>
        {!detail.isOwner && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleLeave} disabled={isLeaving}>
            <LogOut className="size-4" /> Leave
          </Button>
        )}
      </div>

      {showMembers && <MembersPanel detail={detail} />}

      {detail.isOwner && detail.joinRequests.length > 0 && <JoinRequests detail={detail} />}

      {/* Messages */}
      <ScrollArea className="h-[55vh] rounded-xl border border-border/60 bg-card/40">
        <div className="flex flex-col gap-3 p-4">
          {detail.messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No messages yet. Say hello to get the conversation started.
            </p>
          )}
          {detail.messages.map((m) => (
            <div key={m.id} className={cn("flex gap-2.5", m.isSelf && "flex-row-reverse")}>
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className={cn("text-[10px]", m.color)}>{m.initials}</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[75%] space-y-0.5", m.isSelf && "items-end text-right")}>
                <div className={cn("flex items-center gap-2", m.isSelf && "flex-row-reverse")}>
                  <span className="text-xs font-medium">{m.isSelf ? "You" : m.userName}</span>
                  <span className="text-[10px] text-muted-foreground">{m.postedAt}</span>
                </div>
                <div
                  className={cn(
                    "inline-block rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    m.isSelf
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm bg-secondary text-foreground",
                  )}
                >
                  {m.body}
                </div>
              </div>
            </div>
          ))}
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      {/* Composer */}
      <form onSubmit={handleSend} className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message"
          aria-label="Message"
        />
        <Button type="submit" size="icon" disabled={isSending || !draft.trim()} aria-label="Send message">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}

function MembersPanel({ detail }: { detail: ChatroomDetail }) {
  const [copied, setCopied] = useState(false)

  function copyInvite() {
    const link =
      typeof window !== "undefined"
        ? `${window.location.origin}/chatrooms/join/${detail.inviteCode}`
        : detail.inviteCode
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Members</h2>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={copyInvite}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy invite link"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {detail.members.map((m) => (
          <div key={m.userId} className="flex items-center gap-2 rounded-full border border-border/60 py-1 pl-1 pr-3">
            <Avatar className="size-6">
              <AvatarFallback className={cn("text-[10px]", m.color)}>{m.initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium">{m.userName}</span>
            {m.role === "admin" && <Badge variant="secondary">Admin</Badge>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Invite code: <span className="font-mono font-medium text-foreground">{detail.inviteCode}</span>
      </p>
    </div>
  )
}

function JoinRequests({ detail }: { detail: ChatroomDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle(action: "approve" | "reject", requestId: number) {
    startTransition(async () => {
      if (action === "approve") await approveJoinRequest(requestId)
      else await rejectJoinRequest(requestId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <h2 className="text-sm font-medium">
        Join requests <Badge variant="secondary">{detail.joinRequests.length}</Badge>
      </h2>
      <div className="space-y-2">
        {detail.joinRequests.map((req) => (
          <div key={req.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar className="size-7">
                <AvatarFallback className={cn("text-[10px]", req.color)}>{req.initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{req.userName}</span>
              <span className="text-xs text-muted-foreground">{req.createdAt}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="gap-1" disabled={isPending} onClick={() => handle("approve", req.id)}>
                <Check className="size-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-muted-foreground"
                disabled={isPending}
                onClick={() => handle("reject", req.id)}
              >
                <X className="size-3.5" /> Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
