"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Globe,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Radio,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { createHome, type CreateHomeInput } from "@/app/actions/home"
import { uploadMedia, compressImage } from "@/lib/upload-media"
import { HOME_ORG_TYPES, type HomeOrgTypeId } from "@/lib/home/org-types"
import { HOME_PLANS, type HomePlanId } from "@/lib/home/plans"
import { StepIndicator } from "./step-indicator"
import { OrgTypeCards } from "./org-type-cards"
import { AccentPicker } from "./accent-picker"
import { BrandingUpload } from "./branding-upload"
import { PlanCards } from "@/components/home/plan-cards"

const STEPS = [
  { id: "org", label: "Organisation" },
  { id: "identity", label: "Identity" },
  { id: "plan", label: "Plan" },
  { id: "admin", label: "Administrator" },
  { id: "review", label: "Review" },
] as const

// A calm, premium set of section labels — each step is spacious and focused
// rather than one long form. Progress is persisted only in component state;
// nothing is written until the final "Create Home" submit.
export function HomeOnboarding() {
  const router = useRouter()
  const [stepIdx, setStepIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — organisation information
  const [orgName, setOrgName] = useState("")
  const [orgTypeId, setOrgTypeId] = useState<HomeOrgTypeId>(HOME_ORG_TYPES[0].id)
  const [categoryOther, setCategoryOther] = useState("")
  const [country, setCountry] = useState("")
  const [website, setWebsite] = useState("")
  const [description, setDescription] = useState("")

  // Step 2 — identity / branding (held locally until the account exists)
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [accent, setAccent] = useState("#E8833A")

  // Step 3 — plan
  const [plan, setPlan] = useState<HomePlanId>("premium")

  // Step 4 — administrator account
  const [adminName, setAdminName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const needsOther = orgTypeId === "other"
  const selectedType = HOME_ORG_TYPES.find((t) => t.id === orgTypeId) ?? HOME_ORG_TYPES[0]

  function setLogo(blob: Blob) {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoBlob(blob)
    setLogoPreview(URL.createObjectURL(blob))
  }
  function setCover(blob: Blob) {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverBlob(blob)
    setCoverPreview(URL.createObjectURL(blob))
  }
  function removeCover() {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverBlob(null)
    setCoverPreview(null)
  }

  // Per-step validation gates the "Continue" button so users can't advance
  // past a step with missing required fields.
  const canContinue = useMemo(() => {
    switch (stepIdx) {
      case 0:
        return orgName.trim().length > 1 && (!needsOther || categoryOther.trim().length > 1)
      case 1:
        return true // branding is encouraged but logo is applied at review; not hard-blocking
      case 2:
        return Boolean(plan)
      case 3:
        return adminName.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && password.length >= 8
      default:
        return true
    }
  }, [stepIdx, orgName, needsOther, categoryOther, plan, adminName, email, password])

  function next() {
    setError(null)
    if (stepIdx === 0 && !logoPreview && !orgName) return
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))
  }
  function back() {
    setError(null)
    setStepIdx((i) => Math.max(i - 1, 0))
  }

  async function handleCreate() {
    setError(null)
    setSubmitting(true)
    try {
      // 1) Create the administrator account (autoSignIn establishes a session).
      const { error: signUpError } = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: adminName.trim(),
      })
      if (signUpError) throw new Error(signUpError.message ?? "Could not create your administrator account.")

      // 2) Now authenticated — upload branding blobs.
      let logoUrl: string | undefined
      let coverUrl: string | undefined
      if (logoBlob) {
        const compressed = await compressImage(new File([logoBlob], "logo.jpg", { type: "image/jpeg" }), 768, 0.9)
        logoUrl = (await uploadMedia(compressed, "avatars")).url
      }
      if (coverBlob) {
        const compressed = await compressImage(new File([coverBlob], "cover.jpg", { type: "image/jpeg" }), 1600, 0.85)
        coverUrl = (await uploadMedia(compressed, "covers")).url
      }

      // 3) Provision the organisation + Home. Caller becomes Owner.
      const payload: CreateHomeInput = {
        orgName: orgName.trim(),
        orgTypeId,
        categoryOther: needsOther ? categoryOther.trim() : undefined,
        country: country.trim() || undefined,
        website: website.trim() || undefined,
        description: description.trim() || undefined,
        logo: logoUrl,
        cover: coverUrl,
        accentColor: accent,
        plan,
      }
      const { handle } = await createHome(payload)

      router.push(`/home/${handle}?welcome=1`)
      router.refresh()
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-5 py-8 sm:px-8">
      {/* Header — subtle Frequency presence; the org identity takes over later. */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-3.5" />
          </span>
          Frequency Home
        </div>
        <span className="text-xs text-muted-foreground">
          Step {stepIdx + 1} of {STEPS.length}
        </span>
      </div>

      <StepIndicator steps={STEPS.map((s) => ({ id: s.id, label: s.label }))} current={stepIdx} />

      <div className="mt-8 flex-1">
        {stepIdx === 0 && (
          <Section
            eyebrow="Organisation information"
            title="Tell us about your organisation"
            desc="This becomes the public identity people can discover across Frequency."
          >
            <Field label="Organisation name" htmlFor="org-name">
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Kingdom Academy"
                autoFocus
              />
            </Field>

            <div className="space-y-2">
              <span className="text-sm font-medium">Organisation type</span>
              <OrgTypeCards value={orgTypeId} onChange={setOrgTypeId} />
              {needsOther && (
                <Input
                  value={categoryOther}
                  onChange={(e) => setCategoryOther(e.target.value)}
                  placeholder="Describe your organisation type"
                  className="mt-2"
                />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country / region" htmlFor="org-country" icon={<MapPin className="size-3.5" />}>
                <Input
                  id="org-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="United Kingdom"
                />
              </Field>
              <Field label="Website" htmlFor="org-website" optional icon={<Globe className="size-3.5" />}>
                <Input
                  id="org-website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="kingdomacademy.org"
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="org-desc" optional>
              <textarea
                id="org-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short line about your church, ministry or organisation."
                rows={3}
                maxLength={280}
                className="w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed shadow-sm placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </Field>
          </Section>
        )}

        {stepIdx === 1 && (
          <Section
            eyebrow="Organisation identity"
            title="Make it unmistakably yours"
            desc="Your logo becomes the primary identity inside your Home. Frequency stays quietly in the background."
          >
            <BrandingUpload
              logoPreview={logoPreview}
              coverPreview={coverPreview}
              accent={accent}
              orgName={orgName || "Your organisation"}
              onLogo={setLogo}
              onCover={setCover}
              onRemoveCover={removeCover}
            />
            <div className="space-y-2">
              <span className="text-sm font-medium">Accent colour</span>
              <AccentPicker value={accent} onChange={setAccent} />
            </div>
          </Section>
        )}

        {stepIdx === 2 && (
          <Section
            eyebrow="Choose your plan"
            title="Choose your Frequency Home plan"
            desc="Everything you need to run a private digital home for your community. Change or upgrade anytime."
          >
            <PlanCards value={plan} onChange={setPlan} />
          </Section>
        )}

        {stepIdx === 3 && (
          <Section
            eyebrow="Administrator account"
            title="Create your admin account"
            desc="You'll be the Owner of this Home. You can invite more administrators later."
          >
            <Field label="Your name" htmlFor="admin-name" icon={<User className="size-3.5" />}>
              <Input
                id="admin-name"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Andrew Smith"
                autoFocus
              />
            </Field>
            <Field label="Email" htmlFor="admin-email" icon={<Mail className="size-3.5" />}>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@kingdomacademy.org"
              />
            </Field>
            <Field label="Password" htmlFor="admin-password" icon={<Lock className="size-3.5" />}>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </Field>
          </Section>
        )}

        {stepIdx === 4 && (
          <Section
            eyebrow="Review & create"
            title="Review your Home"
            desc="A final look before we open the doors. You can refine everything later from your admin console."
          >
            <ReviewCard
              orgName={orgName}
              typeLabel={needsOther ? categoryOther || "Other" : selectedType.label}
              country={country}
              website={website}
              logoPreview={logoPreview}
              accent={accent}
              plan={plan}
              adminName={adminName}
              email={email}
            />
          </Section>
        )}

        {error && (
          <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Sticky footer navigation */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border/60 pt-6">
        {stepIdx > 0 ? (
          <Button type="button" variant="ghost" onClick={back} disabled={submitting} className="gap-1.5">
            <ArrowLeft className="size-4" /> Back
          </Button>
        ) : (
          <span />
        )}

        {stepIdx < STEPS.length - 1 ? (
          <Button type="button" onClick={next} disabled={!canContinue} className="gap-1.5 px-6">
            Continue <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button type="button" onClick={handleCreate} disabled={submitting || !canContinue} className="gap-2 px-6">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {submitting ? "Creating your Home…" : "Create Home"}
          </Button>
        )}
      </div>
    </div>
  )
}

function Section({
  eyebrow,
  title,
  desc,
  children,
}: {
  eyebrow: string
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</span>
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-[1.75rem]">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{desc}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  optional,
  icon,
  children,
}: {
  label: string
  htmlFor: string
  optional?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-medium">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {label}
        {optional && <span className="font-normal text-muted-foreground">· optional</span>}
      </label>
      {children}
    </div>
  )
}

function ReviewCard({
  orgName,
  typeLabel,
  country,
  website,
  logoPreview,
  accent,
  plan,
  adminName,
  email,
}: {
  orgName: string
  typeLabel: string
  country: string
  website: string
  logoPreview: string | null
  accent: string
  plan: HomePlanId
  adminName: string
  email: string
}) {
  const planMeta = HOME_PLANS[plan]
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      {/* Branded header preview */}
      <div className="relative flex items-center gap-3 px-5 py-5" style={{ backgroundColor: `${accent}14` }}>
        <div
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-lg font-bold text-white ring-1 ring-black/5"
          style={{ backgroundColor: accent }}
        >
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview || "/placeholder.svg"} alt="" className="size-full object-cover" />
          ) : (
            (orgName.trim()[0] || "H").toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-tight">{orgName || "Your organisation"} Home</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="size-3" /> {typeLabel}
            {country ? ` · ${country}` : ""}
          </p>
        </div>
      </div>

      <dl className="divide-y divide-border/60 text-sm">
        <ReviewRow label="Plan" value={`${planMeta.name} · $${planMeta.priceMonthly}/mo`} />
        {website && <ReviewRow label="Website" value={website} />}
        <ReviewRow label="Administrator" value={adminName} />
        <ReviewRow label="Email" value={email} />
        <div className="flex items-start gap-2 px-5 py-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="leading-relaxed">
            We'll create your private Home and generate a unique authorisation key your members use to join. You become
            the Owner.
          </p>
        </div>
      </dl>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}
