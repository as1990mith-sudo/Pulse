"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, Clock, Compass, Flame, Globe, ImageIcon, Lightbulb, Loader2, Lock, MoonStar, Plus, PlusCircle, Search, Users } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  createChatroom,
  listDiscoverChatrooms,
  requestToJoin,
  searchChatrooms,
  type ChatroomSearchResult,
  type ChatroomSummary,
} from "@/app/actions/chatroom"
import { ImageCropper } from "@/components/image-cropper"
import { uploadMedia } from "@/lib/upload-media"
import { useHideOnScrollDown } from "@/lib/chat-chrome"
import { cn } from "@/lib/utils"

function CommunityHelpEntry() {
  return (
    <Link
      href="/chatrooms/community"
      className="group flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-700 px-4 py-3 shadow-lg shadow-emerald-950/40 transition-all hover:from-emerald-800 hover:via-emerald-700 hover:to-teal-600 hover:shadow-emerald-950/50 sm:px-5"
    >
      <Avatar className="size-12 shrink-0 ring-2 ring-white/50 transition-transform duration-200 group-hover:scale-105">
        <AvatarImage src="/community-help-avatar.png" alt="Community Help" />
        <AvatarFallback className="bg-emerald-800 text-base font-bold text-white">?</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold tracking-tight text-white">Community Help</p>
        <p className="truncate text-sm leading-snug text-emerald-50/85">
          Ask anything anonymously — anyone in the community can help.
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-emerald-800 shadow-sm transition-transform group-hover:scale-105">
        Open
      </span>
    </Link>
  )
}

function QuestionOfTheDayEntry() {
  return (
    <Link
      href="/chatrooms/questions"
      className="group flex items-center gap-3 rounded-xl border border-amber-300/20 bg-gradient-to-br from-amber-900 via-amber-800 to-yellow-700 px-4 py-3 shadow-lg shadow-amber-950/40 transition-all hover:from-amber-800 hover:via-amber-700 hover:to-yellow-600 hover:shadow-amber-950/50 sm:px-5"
    >
      <Avatar className="size-12 shrink-0 ring-2 ring-white/50 transition-transform duration-200 group-hover:scale-105">
        <AvatarFallback className="bg-amber-800 text-white">
          <Lightbulb className="size-6" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold tracking-tight text-white">Question of the Day</p>
        <p className="truncate text-sm leading-snug text-amber-50/85">
          One question. Many perspectives. Join today&apos;s community discussion.
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-amber-800 shadow-sm transition-transform group-hover:scale-105">
        Open
      </span>
    </Link>
  )
}

function ITestifyEntry() {
  return (
    <Link
      href="/chatrooms/itestify"
      className="group flex items-center gap-3 rounded-xl border border-rose-300/20 bg-gradient-to-br from-rose-950 via-rose-800 to-red-700 px-4 py-3 shadow-lg shadow-rose-950/40 transition-all hover:from-rose-900 hover:via-rose-700 hover:to-red-600 hover:shadow-rose-950/50 sm:px-5"
    >
      <Avatar className="size-12 shrink-0 ring-2 ring-white/50 transition-transform duration-200 group-hover:scale-105">
        <AvatarFallback className="bg-rose-800 text-white">
          <Flame className="size-6" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold tracking-tight text-white">iTestify</p>
        <p className="truncate text-sm leading-snug text-rose-50/85">
          Share what God has done — testimonies that build faith.
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-rose-800 shadow-sm transition-transform group-hover:scale-105">
        Open
      </span>
    </Link>
  )
}

// Preserved for a future version. Dream Interpretation is intentionally NOT
// rendered in the current Chatroom navigation, but its component, route
// (/chatrooms/dreams), data and backend remain intact so it can be restored.
function DreamInterpretationEntry() {
  return (
    <Link
      href="/chatrooms/dreams"
      className="group flex items-center gap-3 rounded-xl border border-indigo-300/20 bg-gradient-to-br from-indigo-950 via-indigo-800 to-blue-800 px-4 py-3 shadow-lg shadow-indigo-950/40 transition-all hover:from-indigo-900 hover:via-indigo-700 hover:to-blue-700 hover:shadow-indigo-950/50 sm:px-5"
    >
      <Avatar className="size-12 shrink-0 ring-2 ring-white/50 transition-transform duration-200 group-hover:scale-105">
        <AvatarFallback className="bg-indigo-800 text-white">
          <MoonStar className="size-6" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold tracking-tight text-white">Dream Interpretation</p>
        <div className="marquee text-sm leading-snug text-indigo-50/85" aria-label="Share your dreams anonymously — only the interpreter can reply.">
          <div className="marquee__track" aria-hidden="true">
            <span>Share your dreams anonymously — only the interpreter can reply.</span>
            <span>Share your dreams anonymously — only the interpreter can reply.</span>
          </div>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-indigo-800 shadow-sm transition-transform group-hover:scale-105">
        Open
      </span>
    </Link>
  )
}

export function ChatroomBrowser({
  rooms,
  discoverRooms,
  showFeatured = true,
  stickyTabs = true,
}: {
  rooms: ChatroomSummary[]
  discoverRooms: ChatroomSearchResult[]
  // Show the featured community rooms (Community Help / QOTD / iTestify) above
  // the switcher. Kept on the standalone Chatrooms page, hidden when this
  // browser is embedded inside Messages → Rooms (user-created rooms only).
  showFeatured?: boolean
  // Pin the My rooms / Discover / Create switcher to the top and hide it on
  // scroll-down (immersive). Disabled when a parent already owns a sticky tab
  // bar (Messages → Rooms), so we don't stack two pinned controls.
  stickyTabs?: boolean
}) {
  // Drives the immersive hide-on-scroll for the sticky switcher, in lockstep
  // with the global header and bottom nav.
  const chromeHidden = useHideOnScrollDown()

  return (
    <Tabs defaultValue="my-rooms" className="space-y-3">
      {/* Active community rooms, in fixed order: Community Help, Question of
          the Day, iTestify. Dream Interpretation is preserved in the backend
          but intentionally hidden from this navigation for now. */}
      {showFeatured && (
        <div className="space-y-2">
          <CommunityHelpEntry />
          <QuestionOfTheDayEntry />
          <ITestifyEntry />
        </div>
      )}
      {/* Luxury segmented control: a floating rounded-full "rail" with a soft
          hairline border and inner shadow. The active segment lifts on a
          gold gradient pill with a warm glow, while idle segments stay quiet —
          giving the switcher a premium, tactile feel. When `stickyTabs`, the
          whole rail pins beneath the header on a frosted full-bleed backdrop
          and slides away on scroll-down for an immersive, distraction-free read. */}
      <div
        className={cn(
          stickyTabs &&
            "sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out sm:-mx-6 sm:px-6",
          stickyTabs && (chromeHidden ? "-translate-y-[calc(100%+4.5rem)] opacity-0" : "translate-y-0 opacity-100"),
        )}
      >
        <TabsList className="mx-auto grid h-14 w-full max-w-md grid-cols-3 gap-1 rounded-full border border-primary/15 bg-gradient-to-b from-card/80 to-card/40 p-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          {[
            { value: "my-rooms", label: "My rooms", icon: Users },
            { value: "discover", label: "Discover", icon: Compass },
            { value: "create", label: "Create", icon: PlusCircle },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="group relative flex h-full items-center justify-center gap-1.5 rounded-full border-0 bg-transparent text-[13px] font-medium tracking-wide text-muted-foreground shadow-none transition-all duration-300 hover:text-foreground data-[state=active]:bg-gradient-to-b data-[state=active]:from-primary data-[state=active]:to-primary/85 data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_2px_10px_-2px_color-mix(in_oklab,var(--primary)_60%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.25)]"
            >
              <Icon className="size-4 transition-transform duration-300 group-data-[state=active]:scale-110" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="my-rooms">
        <MyRooms rooms={rooms} />
      </TabsContent>
      <TabsContent value="discover">
        <DiscoverRooms initialRooms={discoverRooms} />
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
    // Rooms are rendered as the same rounded "pill" cards as the featured
    // Community Help / QOTD / iTestify entries above — matching layout, shadow
    // and white "Open" pill — while keeping each room's own neutral colour
    // scheme rather than adopting the vivid featured gradients.
    <div className="space-y-2">
      {rooms.map((room) => (
        <Link
          key={room.id}
          href={`/chatrooms/${room.id}`}
          className="group flex items-center gap-3 rounded-xl border-2 border-border bg-card px-4 py-3 shadow-lg shadow-black/20 transition-all hover:border-foreground/30 hover:bg-secondary/40 hover:shadow-black/30 sm:px-5"
        >
          <Avatar className="size-12 shrink-0 ring-2 ring-border/60 transition-transform duration-200 group-hover:scale-105">
            {room.image && <AvatarImage src={room.image || "/placeholder.svg"} alt={room.name} />}
            <AvatarFallback className="bg-secondary text-base font-semibold">
              {room.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
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
          <span className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background shadow-sm transition-transform group-hover:scale-105">
            Open
          </span>
        </Link>
      ))}
    </div>
  )
}

function DiscoverRooms({ initialRooms }: { initialRooms: ChatroomSearchResult[] }) {
  const [query, setQuery] = useState("")
  // Default public rooms (shown when not searching) and search results are held
  // separately so clearing the search box restores the default listing.
  const [defaultRooms, setDefaultRooms] = useState<ChatroomSearchResult[]>(initialRooms)
  const [results, setResults] = useState<ChatroomSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [isSearching, startSearch] = useTransition()
  const [isJoining, startJoin] = useTransition()

  // When there's an active search we show its results; otherwise the default
  // public list. Private rooms only ever appear via search.
  const rooms = searched ? results : defaultRooms

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

  function handleQueryChange(value: string) {
    setQuery(value)
    // Clearing the box returns to the default public listing.
    if (!value.trim()) {
      setSearched(false)
      setResults([])
    }
  }

  function handleRequest(id: number) {
    startJoin(async () => {
      await requestToJoin(id)
      const mark = (r: ChatroomSearchResult) =>
        r.id === id ? { ...r, requestStatus: "pending" as const } : r
      setResults((prev) => prev.map(mark))
      setDefaultRooms((prev) => prev.map(mark))
    })
  }

  return (
    // Edge-to-edge immersive layout: break out of the page padding and stack
    // full-bleed sections divided by borders instead of boxed cards.
    <div className="-mx-4 divide-y divide-border/60 border-y border-border/60 sm:-mx-6">
      <section className="space-y-4 px-4 pb-5 pt-3 sm:px-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search chatrooms"
              aria-label="Search chatrooms by name"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={isSearching || !query.trim()}>
            {isSearching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
          </Button>
        </form>

        {searched ? (
          <p className="text-xs font-medium text-muted-foreground">
            {results.length > 0 ? "Search results" : "No chatrooms match that name."}
          </p>
        ) : (
          rooms.length > 0 && <p className="text-xs font-medium text-muted-foreground">Public rooms</p>
        )}

        {!searched && rooms.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No public rooms yet. Search by name to find private rooms.
          </p>
        )}

        {rooms.length > 0 && (
          <div className="-mx-4 divide-y divide-border/60 border-y border-border/60 sm:-mx-6">
            {rooms.map((room) => (
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
  // Required choice — no default so the user must explicitly pick one.
  const [visibility, setVisibility] = useState<"public" | "private" | null>(null)
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
    if (!visibility) {
      setError("Choose whether this room is public or private.")
      return
    }
    startTransition(async () => {
      try {
        const roomId = await createChatroom({ name: trimmed, description, image, visibility })
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
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Visibility <span className="text-destructive">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "public" as const, icon: Globe, label: "Public" },
                { value: "private" as const, icon: Lock, label: "Private" },
              ]
            ).map(({ value, icon: Icon, label }) => {
              const selected = visibility === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setVisibility(value)
                    setError(null)
                  }}
                  className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left text-sm font-semibold transition-colors ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-foreground/30 hover:bg-secondary/40"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              )
            })}
          </div>
        </fieldset>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full gap-2" disabled={isPending || !name.trim() || !visibility}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create chatroom
        </Button>
        <p className="text-xs text-muted-foreground leading-relaxed">
          You&apos;ll become the admin and get an invite link to share. Public rooms appear under Discover; private
          rooms stay hidden there and can only be found by searching their exact name.
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
