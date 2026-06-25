"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, Clock, Compass, ImageIcon, Loader2, MoonStar, Plus, PlusCircle, Search, Users } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { ImageCropper } from "@/components/image-cropper"
import { uploadMedia } from "@/lib/upload-media"

function CommunityHelpEntry() {
  return (
    <Link
      href="/chatrooms/community"
      className="group flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 transition-colors hover:bg-emerald-500/10 sm:px-4"
    >
      <Avatar className="size-10 shrink-0 ring-2 ring-emerald-500/40 transition-transform duration-200 group-hover:scale-105">
        <AvatarImage src="/community-help-avatar.png" alt="Community Help" />
        <AvatarFallback className="bg-emerald-600 text-sm font-bold text-white">?</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight">Community Help</p>
        <p className="truncate text-xs leading-snug text-muted-foreground">
          Ask anything anonymously — anyone in the community can help.
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity group-hover:opacity-90">
        Open
      </span>
    </Link>
  )
}

function DreamInterpretationEntry() {
  return (
    <Link
      href="/chatrooms/dreams"
      className="group flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-2.5 transition-colors hover:bg-blue-500/10 sm:px-4"
    >
      <Avatar className="size-10 shrink-0 ring-2 ring-blue-500/40 transition-transform duration-200 group-hover:scale-105">
        <AvatarFallback className="bg-blue-600 text-white">
          <MoonStar className="size-5" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight">Dream Interpretation</p>
        <p className="truncate text-xs leading-snug text-muted-foreground">
          Share your dreams anonymously — only the interpreter can reply.
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity group-hover:opacity-90">
        Open
      </span>
    </Link>
  )
}

export function ChatroomBrowser({ rooms }: { rooms: ChatroomSummary[] }) {
  return (
    <Tabs defaultValue="my-rooms" className="space-y-3">
      <div className="space-y-2">
        <CommunityHelpEntry />
        <DreamInterpretationEntry />
      </div>
      {/* Immersive, full-bleed segmented bar: one edge-to-edge strip split into
          three equal segments. Every segment shares the exact same box, so only
          the color changes on the active tab — no size-shifting borders. */}
      <TabsList className="-mx-4 grid h-12 w-[calc(100%+2rem)] grid-cols-3 gap-0 divide-x divide-border/50 rounded-none border-y border-border/60 bg-card/50 p-0 backdrop-blur sm:-mx-6 sm:w-[calc(100%+3rem)]">
        {[
          { value: "my-rooms", label: "My rooms", icon: Users },
          { value: "discover", label: "Discover", icon: Compass },
          { value: "create", label: "Create", icon: PlusCircle },
        ].map(({ value, label, icon: Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="relative flex h-full items-center justify-center gap-2 rounded-none border-0 bg-transparent text-sm font-semibold text-muted-foreground shadow-none transition-colors hover:bg-secondary/40 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
          >
            <Icon className="size-[18px]" />
            {label}
          </TabsTrigger>
        ))}
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
    // Edge-to-edge immersive list: break out of the page's horizontal padding
    // and use full-width divided rows instead of boxed cards.
    <div className="-mx-4 divide-y divide-border/60 border-y border-border/60 sm:-mx-6">
      {rooms.map((room) => (
        <Link
          key={room.id}
          href={`/chatrooms/${room.id}`}
          className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-12 shrink-0 ring-2 ring-border/60 transition-transform duration-200 group-hover:scale-105">
              {room.image && <AvatarImage src={room.image || "/placeholder.svg"} alt={room.name} />}
              <AvatarFallback className="bg-secondary text-base font-semibold">
                {room.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              {/* Name gets the full width and truncates on its own line, so the
                  Admin tag (moved to the meta line below) never overlaps it. */}
              <p className="min-w-0 truncate text-base font-semibold tracking-tight">{room.name}</p>
              {room.description && (
                <p className="truncate text-xs leading-snug text-muted-foreground">{room.description}</p>
              )}
              <p className="mt-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" /> {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
                </span>
                {room.isOwner && (
                  <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px] font-semibold leading-none">
                    Admin
                  </Badge>
                )}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background transition-opacity group-hover:opacity-90">
            Open
          </span>
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
    // Edge-to-edge immersive layout: break out of the page padding and stack
    // full-bleed sections divided by borders instead of boxed cards.
    <div className="-mx-4 divide-y divide-border/60 border-y border-border/60 sm:-mx-6">
      <section className="space-y-3 px-4 py-5 sm:px-6">
        <h2 className="text-sm font-semibold">Have an invite code?</h2>
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
      </section>

      <section className="space-y-4 px-4 py-5 sm:px-6">
        <h2 className="text-sm font-semibold">Search rooms by name</h2>
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

        {searched && results.length === 0 && !isSearching && (
          <p className="py-4 text-center text-sm text-muted-foreground">No chatrooms match that name.</p>
        )}

        {results.length > 0 && (
          <div className="-mx-4 divide-y divide-border/60 border-y border-border/60 sm:-mx-6">
            {results.map((room) => (
              <div
                key={room.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/40 sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-12 shrink-0 ring-2 ring-border/60">
                    {room.image && <AvatarImage src={room.image || "/placeholder.svg"} alt={room.name} />}
                    <AvatarFallback className="bg-secondary text-sm">
                      {room.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{room.name}</p>
                    <p className="text-xs text-muted-foreground">
                      by {room.ownerName} · {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
                    </p>
                  </div>
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
        )}
      </section>
    </div>
  )
}

function CreateRoom() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setCropSrc(URL.createObjectURL(file))
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  async function handleCropped(blob: Blob) {
    setError(null)
    setUploading(true)
    setCropSrc(null)
    try {
      const file = new File([blob], "group.jpg", { type: "image/jpeg" })
      const data = await uploadMedia(file, "chat")
      setImage(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the picture.")
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      try {
        const roomId = await createChatroom({ name: trimmed, description, image })
        router.push(`/chatrooms/${roomId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create the chatroom.")
      }
    })
  }

  return (
    // Edge-to-edge immersive form: full-bleed section bounded by borders.
    <div className="-mx-4 border-y border-border/60 px-4 py-6 sm:-mx-6 sm:px-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {image && <AvatarImage src={image || "/placeholder.svg"} alt="Group picture preview" />}
            <AvatarFallback className="bg-secondary text-base">
              {name.trim() ? name.slice(0, 2).toUpperCase() : "GP"}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Group picture <span className="text-muted-foreground">(optional)</span></p>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
              {image ? "Change picture" : "Upload picture"}
            </Button>
          </div>
        </div>
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

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={1}
          round
          title="Adjust group picture"
          onCancel={() => setCropSrc(null)}
          onCropped={handleCropped}
        />
      )}
    </div>
  )
}
