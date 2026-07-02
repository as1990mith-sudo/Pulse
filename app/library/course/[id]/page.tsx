import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { CoursePlayer } from "@/components/library/course-player"
import { getStoreProduct, isOwned } from "@/app/actions/store"
import { getCurrentUser } from "@/lib/session"

type Params = { id: string }

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params
  const product = await getStoreProduct(id)
  if (!product || product.type !== "course") return { title: "Not found · Frequency" }
  return { title: `${product.title} · Frequency` }
}

export default async function CoursePlayerPage({ params }: { params: Promise<Params> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const product = await getStoreProduct(id)
  if (!product || product.type !== "course") notFound()

  // Only buyers can open the player; send everyone else to the product page.
  const owned = await isOwned(id)
  if (!owned) redirect(`/store/course/${id}`)

  return <CoursePlayer course={product} />
}
