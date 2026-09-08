"use server"

// Keyless address autocomplete + geocoding via Photon (OpenStreetMap).
// Proxied through a server action so the browser never calls the third party
// directly (keeps the origin off client network logs and lets us shape the
// response). Photon needs no API key and returns GeoJSON features carrying both
// a structured address and coordinates, so a single lookup covers suggestion
// AND geocode — the admin picks a suggestion and we already hold its lat/lng.

export type AddressSuggestion = {
  // Stable-ish id for React keys (Photon has no stable id across requests).
  id: string
  // Single-line label shown as the suggestion's primary text, e.g. "10 Downing Street".
  primary: string
  // Locality line shown beneath, e.g. "London, England, United Kingdom".
  secondary: string
  // Full formatted address stored on the event once confirmed.
  formatted: string
  latitude: number
  longitude: number
}

const PHOTON_ENDPOINT = "https://photon.komoot.io/api/"

function buildFormatted(props: Record<string, unknown>): {
  primary: string
  secondary: string
  formatted: string
} {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "")
  const houseNumber = str(props.housenumber)
  const street = str(props.street)
  const name = str(props.name)
  // Primary line: a named place, or the street address if there's a number.
  const streetLine = [houseNumber, street].filter(Boolean).join(" ")
  const primary = name || streetLine || str(props.city) || str(props.country) || "Unknown location"
  // Secondary line: locality context, skipping whatever already appears first.
  const localityParts = [str(props.city), str(props.state), str(props.country)].filter(
    (p) => p && p !== primary,
  )
  const secondary = Array.from(new Set(localityParts)).join(", ")
  const formatted = [primary, secondary].filter(Boolean).join(", ")
  return { primary, secondary, formatted }
}

/**
 * Returns up to 5 address suggestions for a free-text query. Empty/short queries
 * return nothing. Never throws to the client — a provider outage yields an empty
 * list so the admin can still type a venue by hand.
 */
export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const q = (query ?? "").trim()
  if (q.length < 3) return []

  try {
    const url = `${PHOTON_ENDPOINT}?q=${encodeURIComponent(q)}&limit=5`
    const res = await fetch(url, {
      headers: { "User-Agent": "Frequency/1.0 (event address lookup)" },
      // Suggestions are volatile as the user types; don't cache per keystroke,
      // but allow the platform a brief dedupe window for identical queries.
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      features?: { properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }[]
    }
    const features = Array.isArray(data.features) ? data.features : []
    const out: AddressSuggestion[] = []
    for (let i = 0; i < features.length; i++) {
      const f = features[i]
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) continue
      const [longitude, latitude] = coords
      if (typeof latitude !== "number" || typeof longitude !== "number") continue
      const { primary, secondary, formatted } = buildFormatted(f.properties ?? {})
      out.push({ id: `${latitude},${longitude},${i}`, primary, secondary, formatted, latitude, longitude })
    }
    return out
  } catch {
    return []
  }
}
