import Link from "next/link"
import type { ArticleAuthor } from "@/lib/article-types"
import { cn } from "@/lib/utils"

/** A round author avatar (image or initials), optionally linking to the profile. */
export function AuthorAvatar({
  author,
  size = 24,
  ring = false,
  link = false,
}: {
  author: ArticleAuthor
  size?: number
  ring?: boolean
  link?: boolean
}) {
  const inner = author.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={author.image || "/placeholder.svg"}
      alt={author.name}
      className="size-full rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={cn(
        "flex items-center justify-center rounded-full font-semibold",
        author.color,
        ring && "ring-2 ring-white/70",
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {author.initials}
    </span>
  )
  const wrapped = (
    <span
      className={cn("inline-flex shrink-0 overflow-hidden rounded-full", ring && "ring-2 ring-white/70")}
      style={{ width: size, height: size }}
    >
      {inner}
    </span>
  )
  if (link) {
    return (
      <Link href={`/u/${author.id}`} className="shrink-0" aria-label={author.name}>
        {wrapped}
      </Link>
    )
  }
  return wrapped
}
