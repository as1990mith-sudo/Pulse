import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { CartView } from "@/components/store/cart-view"

export const metadata: Metadata = {
  title: "Cart · Frequency",
  description: "Review the books and courses in your cart and check out.",
}

export default function CartPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <CartView />
      </main>
    </div>
  )
}
