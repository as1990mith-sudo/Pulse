/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    // Optimizer ON (previously `unoptimized: true`, which served every original
    // at full size — a ~1600px photo behind a 40px avatar). Now `/_next/image`
    // resizes to the requested width and serves WebP, cached on the CDN, so
    // BOTH existing and new media download far smaller and paint faster.
    // `**` allows any https origin because media lives on Vercel Blob today and
    // Cloudflare R2 for some assets; this avoids breaking any <Image> if an
    // asset host changes. SmartImage/AvatarImage fall back to the raw URL on the
    // rare chance the optimizer is unavailable, so images never hard-break.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    formats: ["image/webp"],
    minimumCacheTTL: 2678400, // 31 days — media URLs are immutable (timestamped keys)
  },
}

export default nextConfig
