import { MapPin } from "lucide-react"

/**
 * Keyless confirmation map for the admin event form ONLY. Renders an
 * OpenStreetMap embed with a marker at the confirmed coordinates so the admin
 * can visually verify the pin before publishing. This is deliberately separate
 * from the public event page's location card (which is left exactly as-is): it
 * exists purely to prevent an ambiguous address being shown to registrants.
 */
export function MapConfirm({
  latitude,
  longitude,
  label,
}: {
  latitude: string
  longitude: string
  label?: string
}) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  // A small bounding box around the point keeps the marker centred and zoomed in.
  const d = 0.004
  const bbox = [lon - d, lat - d, lon + d, lat + d].map((n) => n.toFixed(5)).join("%2C")
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(
    6,
  )}%2C${lon.toFixed(6)}`

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <iframe
        title="Confirm event location"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-40 w-full border-0 bg-secondary"
      />
      {label && (
        <div className="flex items-start gap-2 border-t border-border bg-card px-3 py-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      )}
    </div>
  )
}
