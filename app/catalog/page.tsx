import { redirect } from "next/navigation"

// The catalogue has been merged into the Live tab. Keep this route as a
// permanent redirect so existing links and bookmarks still resolve.
export default function CatalogPage() {
  redirect("/live")
}
