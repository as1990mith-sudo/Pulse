import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { ProductView } from "@/components/store/product-view"
import { getStoreCatalog, getStoreProduct, isOwned } from "@/app/actions/store"

type Params = { type: string; id: string }

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params
  const product = await getStoreProduct(id)
  if (!product) return { title: "Not found · Frequency" }
  return {
    title: `${product.title} · Frequency Store`,
    description: product.description,
  }
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { type, id } = await params
  if (type !== "book" && type !== "course") notFound()
  const product = await getStoreProduct(id)
  if (!product || product.type !== type) notFound()

  const [owned, catalog] = await Promise.all([isOwned(id), getStoreCatalog()])
  const pool = product.type === "course" ? catalog.courses : catalog.books
  const related = pool.filter((p) => p.id !== product.id).slice(0, 8)

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <ProductView product={product} owned={owned} related={related} />
      </main>
    </div>
  )
}
