import { BrandLoader } from "@/components/brand-loader"

/**
 * Route-level loading fallback. Shown automatically by Next.js while a route
 * segment's server work is in flight, giving every navigation a premium,
 * on-brand loading state instead of a blank screen.
 */
export default function Loading() {
  return <BrandLoader />
}
