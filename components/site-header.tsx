import Link from "next/link"
import { Radio } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Frequency</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/#live" className="transition-colors hover:text-foreground">
            Live now
          </Link>
          <Link href="/#upcoming" className="transition-colors hover:text-foreground">
            Upcoming
          </Link>
          <Link href="/#catalog" className="transition-colors hover:text-foreground">
            Episodes
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button render={<Link href="/login" />} nativeButton={false} variant="ghost" size="sm">
            Host sign in
          </Button>
          <Button render={<Link href="/studio" />} nativeButton={false} size="sm">
            Go live
          </Button>
        </div>
      </div>
    </header>
  )
}
