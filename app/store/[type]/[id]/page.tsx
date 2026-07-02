import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { ProductView } from "@/components/store/product-view"
import { getProduct } from "@/lib/store-data"

type Params = { type: string; id: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { type, id } = await params
  const product = getProduct(type, id)
  if (!product) return { title: "Not found · Frequency" }
  return {
    title: `${product.title} · Frequency Store`,
    description: product.description,
  }
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { type, id } = await params
  if (type !== "book" && type !== "course") notFound()
  const product = getProduct(type, id)
  if (!product) notFound()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <ProductView product={product} />
      </main>
    </div>
  )
}
