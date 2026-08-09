"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Camera, Radio, User } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ImageCropper } from "@/components/image-cropper"
import { uploadMedia } from "@/lib/upload-media"
import { createOrganization } from "@/app/actions/organizations"
import { ORG_CATEGORIES, ORG_REACH, type OrgCategory, type OrgReach } from "@/lib/org-types"

type AccountType = "individual" | "organization"

export function AuthForm({ mode, googleEnabled = false }: { mode: "sign-in" | "sign-up"; googleEnabled?: boolean }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  // Sign-in only: toggles the inline "forgot password" view + its success note.
  const [forgot, setForgot] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  // Sign-up only: a profile photo is mandatory. We keep the cropped image as a
  // local blob (with a preview URL) and only upload it AFTER the account is
  // created, because the blob-upload route requires an authenticated session.
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  // Sign-up account type + a two-step flow for the organisation path: first the
  // owner account is created ("account" step), then organisation details ("org").
  const [accountType, setAccountType] = useState<AccountType>("individual")
  const [step, setStep] = useState<"account" | "org">("account")
  const [orgName, setOrgName] = useState("")
  const [orgCategory, setOrgCategory] = useState<OrgCategory>("church")
  const [orgCategoryOther, setOrgCategoryOther] = useState("")
  const [orgReach, setOrgReach] = useState<OrgReach>("local")
  const [orgOnlineOnly, setOrgOnlineOnly] = useState(false)
  const [orgCountry, setOrgCountry] = useState("")
  const [orgCity, setOrgCity] = useState("")
  const [orgRegion, setOrgRegion] = useState("")
  const [orgDescription, setOrgDescription] = useState("")
  const [orgWebsite, setOrgWebsite] = useState("")

  const isSignUp = mode === "sign-up"
  const isOrg = isSignUp && accountType === "organization"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // A profile picture (or organisation logo) is required to sign up.
    if (isSignUp && !avatarBlob) {
      setError(isOrg ? "Please add your organisation logo to continue." : "Please add a profile picture to continue.")
      return
    }

    setLoading(true)

    if (!isSignUp) {
      const { error } = await authClient.signIn.email({ email, password })
      setLoading(false)
      if (error) {
        setError(error.message ?? "Something went wrong. Please try again.")
        return
      }
      router.push("/feed")
      router.refresh()
      return
    }

    // Sign-up: create the account first (autoSignIn establishes a session),
    // then upload the avatar (now authenticated) and persist it on the user.
    const { error } = await authClient.signUp.email({ email, password, name })
    if (error) {
      setLoading(false)
      setError(error.message ?? "Something went wrong. Please try again.")
      return
    }

    try {
      const file = new File([avatarBlob!], "avatar.jpg", { type: "image/jpeg" })
      const data = await uploadMedia(file, "avatars")
      const result = await authClient.updateUser({ image: data.url })
      if (result.error) throw new Error(result.error.message || "Could not save your photo")
    } catch (err) {
      // The account exists; surface the issue but still let them in — they can
      // re-upload from their profile.
      setError(err instanceof Error ? err.message : "Your photo could not be saved.")
    }

    setLoading(false)

    // Organisation accounts continue to a second step to capture ministry
    // details before they land on their new organisation profile.
    if (isOrg) {
      if (!orgName.trim()) setOrgName(name)
      setStep("org")
      return
    }

    // Individuals land on a skippable onboarding step that invites them to
    // subscribe to at least one organisation before entering the feed.
    router.push("/welcome")
    router.refresh()
  }

  async function handleOrgSubmit(e: React.FormEvent) {
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

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    })

    setLoading(false)

    if (error) {
      setError(error.message ?? "Couldn't send the reset email. Please try again.")
      return
    }

    // Always show success (don't reveal whether the email exists).
    setResetSent(true)
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    // Better Auth redirects to Google, then back to `callbackURL`. It creates
    // the account automatically on first sign-in, so this covers sign-up too.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/feed",
    })
    if (error) {
      setGoogleLoading(false)
      setError(error.message ?? "Couldn't sign in with Google. Please try again.")
    }
    // On success the browser navigates away to Google — no further work here.
  }

  function handleAvatarCropped(blob: Blob) {
    setCropSrc(null)
    setError(null)
    // Revoke any previous preview URL before replacing it.
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarBlob(blob)
    setAvatarPreview(URL.createObjectURL(blob))
  }

  function backToSignIn() {
    setForgot(false)
    setResetSent(false)
    setError(null)
  }

  return (
    <main className="flex min-h-svh flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Frequency</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-balance">
              {forgot
                ? "Reset your password"
                : step === "org"
                  ? "Set up your organisation"
                  : isSignUp
                    ? "Join the conversation"
                    : "Welcome back"}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {forgot
                ? "Enter your account email and we'll send you a link to choose a new password."
                : step === "org"
                  ? "Tell us about your ministry so people can discover and subscribe to it."
                  : isSignUp
                    ? "Create an account to connect with community and discover ministries."
                    : "Sign in to chat, call in, and share your thoughts."}
            </p>
          </div>

          {forgot ? (
            resetSent ? (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-6 text-center">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  If an account exists for <span className="font-medium text-foreground">{email}</span>, a password
                  reset link is on its way. Check your inbox (and spam folder) — the link expires in 1 hour.
                </p>
                <Button type="button" variant="outline" onClick={backToSignIn} className="w-full">
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
                <div className="space-y-2">
                  <label htmlFor="reset-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
                <button
                  type="button"
                  onClick={backToSignIn}
                  className="w-full text-center text-sm font-medium text-primary hover:underline"
                >
                  Back to sign in
                </button>
              </form>
            )
          ) : step === "org" ? (
            <OrgDetailsForm
              onSubmit={handleOrgSubmit}
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
          ) : (
            <>
              {isSignUp && (
                <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
                  <AccountTypeCard
                    active={accountType === "individual"}
                    onClick={() => setAccountType("individual")}
                    icon={<User className="size-5" />}
                    title="Individual"
                    subtitle="Join the community"
                  />
                  <AccountTypeCard
                    active={accountType === "organization"}
                    onClick={() => setAccountType("organization")}
                    icon={<Building2 className="size-5" />}
                    title="Organisation"
                    subtitle="Church or ministry"
                  />
                </div>
              )}

              {googleEnabled && !isOrg && (
                <div className="mb-4 space-y-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogle}
                    disabled={googleLoading || loading}
                    className="w-full gap-2"
                  >
                    <GoogleIcon className="size-4" />
                    {googleLoading ? "Redirecting..." : `Continue with Google`}
                  </Button>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
                {isSignUp && (
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      aria-label={isOrg ? "Add your organisation logo" : "Add a profile picture"}
                      className="relative flex size-20 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-muted-foreground transition-colors hover:bg-muted/70"
                    >
                      {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarPreview || "/placeholder.svg"}
                          alt={isOrg ? "Your organisation logo" : "Your profile picture"}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Camera className="size-6" />
                      )}
                      <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                        <Camera className="size-3.5" />
                      </span>
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {avatarPreview
                        ? isOrg
                          ? "Tap to change your logo"
                          : "Tap to change your photo"
                        : isOrg
                          ? "Add your organisation logo (required)"
                          : "Add a profile picture (required)"}
                    </p>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setCropSrc(URL.createObjectURL(file))
                        e.target.value = ""
                      }}
                    />
                  </div>
                )}
                {isSignUp && (
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium">
                      {isOrg ? "Your name" : "Display name"}
                    </label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={isOrg ? "The person managing this account" : "What should we call you?"}
                      required
                      autoComplete="name"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => {
                          setForgot(true)
                          setError(null)
                        }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading
                    ? "Please wait..."
                    : isOrg
                      ? "Continue"
                      : isSignUp
                        ? "Create account"
                        : "Sign in"}
                </Button>
              </form>
            </>
          )}

          {!forgot && step === "account" && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account? " : "New to Frequency? "}
              <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="font-medium text-primary hover:underline">
                {isSignUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          )}
        </div>
      </div>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={1}
          round
          title={isOrg ? "Adjust organisation logo" : "Adjust profile picture"}
          onCancel={() => setCropSrc(null)}
          onCropped={handleAvatarCropped}
        />
      )}
    </main>
  )
}

function AccountTypeCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
        active
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border/60 bg-card hover:border-border hover:bg-muted/40"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <span className="text-sm font-semibold leading-tight">{title}</span>
      <span className="text-xs leading-tight text-muted-foreground">{subtitle}</span>
    </button>
  )
}

export function OrgDetailsForm(props: {
  onSubmit: (e: React.FormEvent) => void
  loading: boolean
  error: string | null
  orgName: string
  setOrgName: (v: string) => void
  orgCategory: OrgCategory
  setOrgCategory: (v: OrgCategory) => void
  orgCategoryOther: string
  setOrgCategoryOther: (v: string) => void
  orgReach: OrgReach
  setOrgReach: (v: OrgReach) => void
  orgOnlineOnly: boolean
  setOrgOnlineOnly: (v: boolean) => void
  orgCountry: string
  setOrgCountry: (v: string) => void
  orgCity: string
  setOrgCity: (v: string) => void
  orgRegion: string
  setOrgRegion: (v: string) => void
  orgDescription: string
  setOrgDescription: (v: string) => void
  orgWebsite: string
  setOrgWebsite: (v: string) => void
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
      <div className="space-y-2">
        <label htmlFor="org-name" className="text-sm font-medium">
          Organisation name
        </label>
        <Input
          id="org-name"
          value={props.orgName}
          onChange={(e) => props.setOrgName(e.target.value)}
          placeholder="e.g. Kingdom Academy"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Category</label>
        <Select value={props.orgCategory} onValueChange={(v) => props.setOrgCategory(v as OrgCategory)}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {ORG_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {props.orgCategory === "other" && (
        <div className="space-y-2">
          <label htmlFor="org-category-other" className="text-sm font-medium">
            Please specify
          </label>
          <Input
            id="org-category-other"
            value={props.orgCategoryOther}
            onChange={(e) => props.setOrgCategoryOther(e.target.value)}
            placeholder="Describe your organisation type"
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Reach</label>
        <Select value={props.orgReach} onValueChange={(v) => props.setOrgReach(v as OrgReach)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORG_REACH.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label} — {r.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
        <div className="pr-3">
          <p className="text-sm font-medium">Online-only organisation</p>
          <p className="text-xs leading-tight text-muted-foreground">Discoverable globally, location optional</p>
        </div>
        <Switch checked={props.orgOnlineOnly} onCheckedChange={props.setOrgOnlineOnly} aria-label="Online-only organisation" />
      </div>

      {!props.orgOnlineOnly && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="org-city" className="text-sm font-medium">
              City/Town
            </label>
            <Input id="org-city" value={props.orgCity} onChange={(e) => props.setOrgCity(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <label htmlFor="org-region" className="text-sm font-medium">
              Region/State
            </label>
            <Input
              id="org-region"
              value={props.orgRegion}
              onChange={(e) => props.setOrgRegion(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <label htmlFor="org-country" className="text-sm font-medium">
              Country
            </label>
            <Input
              id="org-country"
              value={props.orgCountry}
              onChange={(e) => props.setOrgCountry(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="org-desc" className="text-sm font-medium">
          Short description
        </label>
        <Textarea
          id="org-desc"
          value={props.orgDescription}
          onChange={(e) => props.setOrgDescription(e.target.value)}
          placeholder="A sentence about your ministry"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="org-website" className="text-sm font-medium">
          Official website
        </label>
        <Input
          id="org-website"
          value={props.orgWebsite}
          onChange={(e) => props.setOrgWebsite(e.target.value)}
          placeholder="yourministry.org (optional)"
        />
      </div>

      {props.error && (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      )}

      <Button type="submit" disabled={props.loading} className="w-full">
        {props.loading ? "Creating..." : "Create organisation"}
      </Button>
    </form>
  )
}

// Multi-color Google "G" mark for the OAuth button (lucide has no brand icons).
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
