import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { BookReader } from "@/components/library/book-reader"
import { getStoreProduct, isOwned } from "@/app/actions/store"
import { getCurrentUser } from "@/lib/session"

type Params = { id: string }

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params
  const product = await getStoreProduct(id)
  if (!product || product.type !== "book") return { title: "Not found · Frequency" }
  return { title: `Reading ${product.title} · Frequency` }
}

export default async function BookReaderPage({ params }: { params: Promise<Params> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const product = await getStoreProduct(id)
  if (!product || product.type !== "book") notFound()

  // Only buyers can open the reader; send everyone else to the product page.
  const owned = await isOwned(id)
  if (!owned) redirect(`/store/book/${id}`)

  return <BookReader title={product.title} author={product.author} fileUrl={product.fileUrl ?? ""} fileName={product.fileName ?? ""} />
}
