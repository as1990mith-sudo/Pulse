import { redirect } from "next/navigation"
import { getActiveHome } from "@/lib/home/active-home"

/**
 * `/catalogue` is a pure shortcut, not a page of its own. It resolves the
 * viewer's ACTIVE Home and forwards to that Home profile's existing Catalogue
 * tab, so the app-menu entry lands members straight on the catalogue without
 * duplicating any of its UI. With no active Home (signed out, or not yet in a
 * Home) it falls back to the My Homes switcher.
 */
export default async function CatalogueShortcutPage() {
  const home = await getActiveHome()
  if (!home) redirect("/homes")
  redirect(`/org/${home.handle}?tab=catalogue`)
}
