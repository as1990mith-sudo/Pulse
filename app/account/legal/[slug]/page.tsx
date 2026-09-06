import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AccountPageShell } from "@/components/account/account-ui"
import { getLegalDocument, LEGAL_DOCUMENTS } from "@/lib/legal-content"

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const doc = getLegalDocument(slug)
  return { title: doc ? `${doc.title} · Frequency Home` : "Legal · Frequency Home" }
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const doc = getLegalDocument(slug)
  if (!doc) notFound()

  return (
    <AccountPageShell title={doc.title} backHref="/account/legal" backLabel="Legal">
      <p className="-mt-2 mb-8 text-sm text-muted-foreground">Last updated {doc.updated}</p>

      <div className="rounded-2xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/10">
        Placeholder text — replace with your final {doc.title.toLowerCase()} before launch.
      </div>

      <article className="mt-8 flex flex-col gap-8">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-2 font-display text-lg font-semibold tracking-tight">{section.heading}</h2>
            <p className="text-pretty leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </article>
    </AccountPageShell>
  )
}
