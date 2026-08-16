import "server-only"

/**
 * S3-compatible object storage config for LiveKit Egress recordings.
 *
 * We use Cloudflare R2 (S3-compatible) in production, but nothing here is
 * R2-specific — any S3-compatible bucket works by setting the same env vars.
 * These are read at call time (not module load) so the values always reflect
 * the current environment.
 *
 *   S3_ENDPOINT          e.g. https://<accountid>.r2.cloudflarestorage.com
 *   S3_REGION            R2 requires the literal "auto" (see coercion below)
 *   S3_ACCESS_KEY_ID     from the bucket's S3 API token
 *   S3_SECRET_ACCESS_KEY from the bucket's S3 API token
 *   S3_BUCKET            e.g. replays
 *   S3_PUBLIC_BASE_URL   public read base, e.g. https://pub-xxxx.r2.dev
 */
export type StorageConfig = {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string
}

/**
 * R2's S3 API only accepts the region token "auto". A common setup mistake is
 * pasting the endpoint URL (or leaving it blank) into S3_REGION, which makes the
 * AWS SDK throw "Region not accepted". We coerce anything that isn't a plain
 * region token (letters/digits/hyphens) down to "auto" so a mispaste can't break
 * recording — the endpoint already fully determines where requests go.
 */
export function normalizeRegion(raw: string | undefined | null): string {
  const v = (raw ?? "").trim()
  if (!v || /^https?:\/\//i.test(v) || /[^a-z0-9-]/i.test(v)) return "auto"
  return v
}

export function getStorageConfig(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT?.trim()
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.S3_BUCKET?.trim()
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim()
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null
  return {
    endpoint,
    region: normalizeRegion(process.env.S3_REGION),
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
  }
}

export function isStorageConfigured(): boolean {
  return getStorageConfig() !== null
}

/** Builds the public read URL for a stored object key (handles trailing slashes). */
export function buildPublicUrl(key: string): string {
  const cfg = getStorageConfig()
  const base = (cfg?.publicBaseUrl ?? "").replace(/\/+$/, "")
  return `${base}/${key.replace(/^\/+/, "")}`
}
