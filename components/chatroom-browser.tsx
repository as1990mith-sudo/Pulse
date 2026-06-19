"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, Clock, Loader2, Plus, Search, Users } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  createChatroom,
  joinByInviteCode,
  requestToJoin,
  searchChatrooms,
  type ChatroomSearchResult,
  type ChatroomSummary,
} from "@/app/actions/chatroom"

export function ChatroomBrowser({ rooms }: { rooms: ChatroomSummary[] }) {
  return (
    <Tabs defaultValue="my-rooms" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="my-rooms">My rooms</TabsTrigger>
        <TabsTrigger value="discover">Discover</TabsTrigger>
        <TabsTrigger value="create">Create</TabsTrigger>
      </TabsList>

      <TabsContent value="my-rooms">
        <MyRooms rooms={rooms} />
      </TabsContent>
      <TabsContent value="discover">
        <DiscoverRooms />
      </TabsContent>
      <TabsContent value="create">
        <CreateRoom />
      </TabsContent>
    </Tabs>
  )
}

function MyRooms({ rooms }: { rooms: ChatroomSummary[] }) {
  if (rooms.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <Users className="size-8 text-muted-foreground" />
        <p className="font-medium">You haven&apos;t joined any chatrooms yet</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Create your own room or discover one to request to join.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {rooms.map((room) => (
        <Link key={room.id} href={`/chatrooms/${room.id}`}>
          <Card className="flex items-center justify-between gap-4 p-4 transition-colors hover:border-primary/60">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold">{room.name}</p>
                {room.isOwner && <Badge variant="secondary">Admin</Badge>}
              </div>
              {room.description && (
                <p className="truncate text-sm text-muted-foreground">{room.description}</p>
              )}
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" /> {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
              </p>
            </div>
            <span className="text-sm font-medium text-primary">Open</span>
          </Card>
        </Link>
      ))}
    </div>
  )
}

function DiscoverRooms() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ChatroomSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [inviteCode, setInviteCode] = useState("")
  const [isSearching, startSearch] = useTransition()
  const [isJoining, startJoin] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    startSearch(async () => {
      const res = await searchChatrooms(q)
      setResults(res)
      setSearched(true)
    })
  }

  function handleRequest(id: number) {
    startJoin(async () => {
      await requestToJoin(id)
      setResults((prev) => prev.map((r) => (r.id === id ? { ...r, requestStatus: "pending" } : r)))
    })
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const code = inviteCode.trim()
    if (!code) return
    startJoin(async () => {
      try {
        const roomId = await joinByInviteCode(code)
        router.push(`/chatrooms/${roomId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not join with that code.")
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">Have an invite code?</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <Input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Enter invite code"
            aria-label="Invite code"
          />
          <Button type="submit" disabled={isJoining || !inviteCode.trim()}>
            {isJoining ? <Loader2 className="size-4 animate-spin" /> : "Join"}
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">Search rooms by name</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chatrooms"
              aria-label="Search chatrooms by name"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={isSearching || !query.trim()}>
            {isSearching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
          </Button>
        </form>

        <div className="space-y-2">
          {searched && results.length === 0 && !isSearching && (
            <p className="py-4 text-center text-sm text-muted-foreground">No chatrooms match that name.</p>
          )}
          {results.map((room) => (
            <div
              key={room.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{room.name}</p>
                <p className="text-xs text-muted-foreground">
                  by {room.ownerName} · {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
                </p>
              </div>
              {room.isMember ? (
                <Link href={`/chatrooms/${room.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Open
                </Link>
              ) : room.requestStatus === "pending" ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" /> Requested
                </span>
              ) : room.requestStatus === "approved" ? (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <Check className="size-3" /> Approved
                </span>
              ) : (
                <Button size="sm" disabled={isJoining} onClick={() => handleRequest(room.id)}>
                  Request to join
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function CreateRoom() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      try {
        const roomId = await createChatroom({ name: trimmed, description })
        router.push(`/chatrooms/${roomId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create the chatroom.")
      }
    })
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="room-name" className="text-sm font-medium">
            Chatroom name
          </label>
          <Input
            id="room-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sunday Worship Crew"
            maxLength={80}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="room-desc" className="text-sm font-medium">
            Description <span className="text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="room-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this room about?"
            rows={3}
            maxLength={280}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full gap-2" disabled={isPending || !name.trim()}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create chatroom
        </Button>
        <p className="text-xs text-muted-foreground leading-relaxed">
          You&apos;ll become the admin and get an invite link to share. Others can also find your room by name and
          request to join.
        </p>
      </form>
    </Card>
  )
}
