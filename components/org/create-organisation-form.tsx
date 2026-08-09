"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { OrgDetailsForm } from "@/components/auth-form"
import { createOrganization } from "@/app/actions/organizations"
import type { OrgCategory, OrgReach } from "@/lib/org-types"

/**
 * Standalone "create your organisation" form for an already-signed-in member.
 *
 * This is the in-app recovery path for the two-step organisation sign-up: if a
 * member created their account but never completed the organisation-details
 * step (leaving them stranded as an `individual` with no organisation record),
 * they can finish here at any time. It reuses the exact same `OrgDetailsForm`
 * as sign-up so the experience is identical, then calls `createOrganization`
 * — which inserts the organisation row and flips the account to `organization`
 * — and routes to the freshly created profile.
 */
export function CreateOrganisationForm({ initialName = "" }: { initialName?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [orgName, setOrgName] = useState(initialName)
  const [orgCategory, setOrgCategory] = useState<OrgCategory>("church")
  const [orgCategoryOther, setOrgCategoryOther] = useState("")
  const [orgReach, setOrgReach] = useState<OrgReach>("local")
  const [orgOnlineOnly, setOrgOnlineOnly] = useState(false)
  const [orgCountry, setOrgCountry] = useState("")
  const [orgCity, setOrgCity] = useState("")
  const [orgRegion, setOrgRegion] = useState("")
  const [orgDescription, setOrgDescription] = useState("")
  const [orgWebsite, setOrgWebsite] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!orgName.trim()) {
      setError("Please enter your organisation name.")
      return
    }
    if (orgCategory === "other" && !orgCategoryOther.trim()) {
      setError("Please specify your organisation category.")
      return
    }

    setLoading(true)
    try {
      const { handle } = await createOrganization({
        name: orgName,
        category: orgCategory,
        categoryOther: orgCategory === "other" ? orgCategoryOther : undefined,
        description: orgDescription,
        reach: orgReach,
        onlineOnly: orgOnlineOnly,
        country: orgCountry,
        city: orgCity,
        region: orgRegion,
        website: orgWebsite,
      })
      router.push(`/org/${handle}`)
      router.refresh()
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : "Couldn't create your organisation. Please try again.")
    }
  }

  return (
    <OrgDetailsForm
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      orgName={orgName}
      setOrgName={setOrgName}
      orgCategory={orgCategory}
      setOrgCategory={setOrgCategory}
      orgCategoryOther={orgCategoryOther}
      setOrgCategoryOther={setOrgCategoryOther}
      orgReach={orgReach}
      setOrgReach={setOrgReach}
      orgOnlineOnly={orgOnlineOnly}
      setOrgOnlineOnly={setOrgOnlineOnly}
      orgCountry={orgCountry}
      setOrgCountry={setOrgCountry}
      orgCity={orgCity}
      setOrgCity={setOrgCity}
      orgRegion={orgRegion}
      setOrgRegion={setOrgRegion}
      orgDescription={orgDescription}
      setOrgDescription={setOrgDescription}
      orgWebsite={orgWebsite}
      setOrgWebsite={setOrgWebsite}
    />
  )
}
