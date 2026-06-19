import Link from "next/link"
import { Headphones, Radio } from "lucide-react"
import type { Show } from "@/lib/data"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LiveBadge } from "@/components/live-badge"

export function FeaturedHero({ show }: { show: Show }) {
  return (
    <section className="relative overflow-hidden">
      <img
        src={show.cover || "/placeholder.svg"}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/90 to-transparent" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 md:py-24">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Radio className="size-4 text-primary" /> Streaming now on Frequency
          </span>
        </div>

        <div className="max-w-2xl space-y-5">
          <div className="flex items-center gap-3">
            <LiveBadge />
            <span className="text-sm font-medium text-muted-foreground">
              {show.listeners.toLocaleString()} people tuned in
            </span>
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">{show.title}</h1>
          <p className="text-pretty text-lg text-muted-foreground leading-relaxed">{show.description}</p>

          <div className="flex items-center gap-3 pt-1">
            <Avatar className="size-9">
              <AvatarImage src={show.host.avatar || "/placeholder.svg"} alt={show.host.name} />
              <AvatarFallback>{show.host.name[0]}</AvatarFallback>
            </Avatar>
            <div className="text-sm">
              <p className="font-medium leading-none">{show.host.name}</p>
              <p className="text-muted-foreground">{show.host.handle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button render={<Link href={`/live/${show.id}`} />} nativeButton={false} size="lg" className="gap-2">
              <Headphones className="size-4" /> Join the stream
            </Button>
            <Button render={<Link href="/studio" />} nativeButton={false} size="lg" variant="secondary">
              Start your own show
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
