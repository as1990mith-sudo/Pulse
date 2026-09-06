/**
 * Legal + policy documents for Account → Legal. The body text is deliberately
 * short placeholder copy, clearly marked as such in the UI, to be replaced with
 * the organisation's final approved policies. Structure (titles, slugs, section
 * headings) is stable so swapping in real copy is a text-only change.
 */

export type LegalSlug =
  | "privacy-policy"
  | "terms-of-service"
  | "community-guidelines"
  | "cookie-policy"

export type LegalDocument = {
  slug: LegalSlug
  title: string
  updated: string
  sections: { heading: string; body: string }[]
}

const PLACEHOLDER =
  "This is placeholder text. Replace it with your organisation's final approved wording before launch."

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    updated: "2026",
    sections: [
      { heading: "Overview", body: PLACEHOLDER },
      { heading: "Information we collect", body: PLACEHOLDER },
      { heading: "How we use your information", body: PLACEHOLDER },
      { heading: "Your rights and choices", body: PLACEHOLDER },
      { heading: "Contact", body: PLACEHOLDER },
    ],
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    updated: "2026",
    sections: [
      { heading: "Acceptance of terms", body: PLACEHOLDER },
      { heading: "Using Frequency Home", body: PLACEHOLDER },
      { heading: "Accounts and responsibilities", body: PLACEHOLDER },
      { heading: "Content and conduct", body: PLACEHOLDER },
      { heading: "Termination", body: PLACEHOLDER },
    ],
  },
  {
    slug: "community-guidelines",
    title: "Community Guidelines",
    updated: "2026",
    sections: [
      { heading: "Our expectations", body: PLACEHOLDER },
      { heading: "Respectful participation", body: PLACEHOLDER },
      { heading: "What isn't allowed", body: PLACEHOLDER },
      { heading: "Reporting and enforcement", body: PLACEHOLDER },
    ],
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    updated: "2026",
    sections: [
      { heading: "What cookies we use", body: PLACEHOLDER },
      { heading: "Managing cookies", body: PLACEHOLDER },
      { heading: "Third-party cookies", body: PLACEHOLDER },
    ],
  },
]

export function getLegalDocument(slug: string): LegalDocument | null {
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug) ?? null
}
