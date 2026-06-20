"use client"

/**
 * A `template.tsx` re-mounts on every navigation (unlike `layout.tsx`), so we
 * use it to play a subtle fade-and-rise transition whenever the route changes.
 * This gives navigation a smooth, lightly animated feel. The animation is
 * automatically disabled for users who prefer reduced motion (see globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
