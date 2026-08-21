"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  AtSign,
  Building2,
  Camera,
  Check,
  Globe,
  ImagePlus,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Play,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { updateOrganization } from "@/app/actions/organizations"
import { orgLocationLabel, type OrganizationView } from "@/lib/org-types"
import { VerifiedBadge } from "@/components/org/verified-badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import { cn } from "@/lib/utils"

const DESC_MAX = 280

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i

type Snapshot = {
  logo: string
  cover: string
  description: string
  onlineOnly: boolean
  city: string
  region: string
  country: string
  website: string
  contactEmail: string
  contactPhone: string
  instagram: string
  youtube: string
  facebook: string
  twitter: string
  otherLink: string
  mission: string
  vision: string
  history: string
  beliefs: string
}

function snapshotFromOrg(org: OrganizationView): Snapshot {
  return {
    logo: org.logo ?? "",
    cover: org.cover ?? "",
    description: org.description ?? "",
    onlineOnly: org.onlineOnly,
    city: org.city ?? "",
    region: org.region ?? "",
    country: org.country ?? "",
    website: org.website ?? "",
    contactEmail: org.contactEmail ?? "",
    contactPhone: org.contactPhone ?? "",
    instagram: org.socials?.instagram ?? "",
    youtube: org.socials?.youtube ?? "",
    facebook: org.socials?.facebook ?? "",
    twitter: org.socials?.twitter ?? "",
    otherLink: org.socials?.other ?? "",
    mission: org.mission ?? "",
    vision: org.vision ?? "",
    history: org.history ?? "",
    beliefs: org.beliefs ?? "",
  }
}

/**
 * Owner-only organisation profile workspace.
 *
 * Reimagined as a premium management experience rather than a settings modal:
 * a full-screen flow on mobile and a large centred two-column workspace on
 * desktop, pairing an editorial form with a live public-profile preview that
 * updates as you type. All fields and the `updateOrganization` action are
 * preserved unchanged.
 */
export function OrgManageSheet({ org }: { org: OrganizationView }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const initial = useRef<Snapshot>(snapshotFromOrg(org))

  const [logo, setLogo] = useState(initial.current.logo)
  const [cover, setCover] = useState(initial.current.cover)
  const [description, setDescription] = useState(initial.current.description)
  const [onlineOnly, setOnlineOnly] = useState(initial.current.onlineOnly)
  const [city, setCity] = useState(initial.current.city)
  const [region, setRegion] = useState(initial.current.region)
  const [country, setCountry] = useState(initial.current.country)
  const [website, setWebsite] = useState(initial.current.website)
  const [contactEmail, setContactEmail] = useState(initial.current.contactEmail)
  const [contactPhone, setContactPhone] = useState(initial.current.contactPhone)
  const [instagram, setInstagram] = useState(initial.current.instagram)
  const [youtube, setYoutube] = useState(initial.current.youtube)
  const [facebook, setFacebook] = useState(initial.current.facebook)
  const [twitter, setTwitter] = useState(initial.current.twitter)
  const [otherLink, setOtherLink] = useState(initial.current.otherLink)
  const [mission, setMission] = useState(initial.current.mission)
  const [vision, setVision] = useState(initial.current.vision)
  const [history, setHistory] = useState(initial.current.history)
  const [beliefs, setBeliefs] = useState(initial.current.beliefs)

  const current: Snapshot = {
    logo,
    cover,
    description,
    onlineOnly,
    city,
    region,
    country,
    website,
    contactEmail,
    contactPhone,
    instagram,
    youtube,
    facebook,
    twitter,
    otherLink,
    mission,
    vision,
    history,
    beliefs,
  }

  const dirty = useMemo(
    () => JSON.stringify(current) !== JSON.stringify(initial.current),
    [current],
  )

  const emailError = contactEmail.trim() && !EMAIL_RE.test(contactEmail.trim()) ? "Enter a valid email address." : null
  const websiteError = website.trim() && !URL_RE.test(website.trim()) ? "Enter a valid website address." : null
  const hasErrors = Boolean(emailError || websiteError)

  const completion = useMemo(() => {
    const checks = [
      description.trim().length > 0,
      onlineOnly || (city.trim().length > 0 && country.trim().length > 0),
      website.trim().length > 0,
      contactEmail.trim().length > 0,
      contactPhone.trim().length > 0,
      [instagram, youtube, facebook, twitter, otherLink].some((s) => s.trim().length > 0),
      mission.trim().length > 0,
      beliefs.trim().length > 0,
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [description, onlineOnly, city, country, website, contactEmail, contactPhone, instagram, youtube, facebook, twitter, otherLink, mission, beliefs])

  function reset() {
    const s = initial.current
    setLogo(s.logo)
    setCover(s.cover)
    setDescription(s.description)
    setOnlineOnly(s.onlineOnly)
    setCity(s.city)
    setRegion(s.region)
    setCountry(s.country)
    setWebsite(s.website)
    setContactEmail(s.contactEmail)
    setContactPhone(s.contactPhone)
    setInstagram(s.instagram)
    setYoutube(s.youtube)
    setFacebook(s.facebook)
    setTwitter(s.twitter)
    setOtherLink(s.otherLink)
    setMission(s.mission)
    setVision(s.vision)
    setHistory(s.history)
    setBeliefs(s.beliefs)
    setError(null)
  }

  function cancel() {
    reset()
    setOpen(false)
  }

  function save() {
    if (hasErrors) return
    setError(null)
    startTransition(async () => {
      try {
        await updateOrganization(org.id, {
          logo: logo.trim() || null,
          cover: cover.trim() || null,
          description: description.trim() || null,
          onlineOnly,
          city: onlineOnly ? null : city.trim() || null,
          region: onlineOnly ? null : region.trim() || null,
          country: onlineOnly ? null : country.trim() || null,
          website: website.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          socials: {
            instagram: instagram.trim() || undefined,
            youtube: youtube.trim() || undefined,
            facebook: facebook.trim() || undefined,
            twitter: twitter.trim() || undefined,
            other: otherLink.trim() || undefined,
          },
          mission: mission.trim() || null,
          vision: vision.trim() || null,
          history: history.trim() || null,
          beliefs: beliefs.trim() || null,
        })
        initial.current = { ...current }
        setSaved(true)
        router.refresh()
        setTimeout(() => {
          setSaved(false)
          setOpen(false)
        }, 850)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save your changes. Please try again.")
      }
    })
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        setOpen(next)
      }}
    >
      <DialogPrimitive.Trigger
        aria-label="Manage organisation"
        className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Settings2 className="size-4" /> Manage
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60 duration-200 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-card text-card-foreground outline-none",
            // Mobile: full-screen sheet
            "inset-0 h-[100dvh] w-full",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0",
            // Desktop: centred workspace card
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[92svh] sm:w-[min(1060px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:border-border/60 sm:shadow-2xl sm:shadow-black/50 sm:duration-200 sm:data-open:zoom-in-95 sm:data-open:slide-in-from-bottom-0 sm:data-closed:zoom-out-95",
          )}
        >
          {/* Header */}
          <header className="relative shrink-0 border-b border-border/60 px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/90">Organisation</p>
            <DialogPrimitive.Title className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[26px]">
              Your organisation profile
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1.5 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              Help people discover, understand and connect with your ministry.
            </DialogPrimitive.Description>

            {/* Completion indicator */}
            <div className="mt-4 flex items-center gap-3 sm:max-w-md">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                Profile {completion}% complete
              </span>
            </div>

            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:right-5 sm:top-5"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </header>

          {/* Body */}
          <div className="min-h-0 flex-1">
            <div className="grid h-full min-h-0 lg:grid-cols-2">
              {/* Form column */}
              <div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
                <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
                  {/* Brand imagery */}
                  <Section title="Brand" hint="Your profile picture and cover art appear at the top of your public page.">
                    <BrandImages
                      orgName={org.name}
                      initials={org.initials}
                      color={org.color}
                      logo={logo}
                      cover={cover}
                      onLogo={setLogo}
                      onCover={setCover}
                    />
                  </Section>

                  {/* About */}
                  <Section title="About" hint="A concise, editorial summary of who you are.">
                    <Field
                      label="Short description"
                      count={
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            description.length > DESC_MAX - 20 ? "text-primary" : "text-muted-foreground/60",
                          )}
                        >
                          {description.length}/{DESC_MAX}
                        </span>
                      }
                      hint="This appears at the top of your public profile."
                    >
                      <textarea
                        value={description}
                        maxLength={DESC_MAX}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="A teaching and learning community with the aim to spread God's culture…"
                        className={cn(TEXTAREA_CLS, "min-h-[104px]")}
                      />
                    </Field>
                  </Section>

                  {/* Location */}
                  <Section title="Location" hint="Where you're based, or whether you operate everywhere.">
                    <button
                      type="button"
                      onClick={() => setOnlineOnly((v) => !v)}
                      className={cn(
                        "flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-colors",
                        onlineOnly ? "border-primary/40 bg-primary/[0.06]" : "border-border/50 bg-background/40 hover:bg-background/70",
                      )}
                    >
                      <span className="flex min-w-0 items-start gap-3">
                        <span
                          className={cn(
                            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                            onlineOnly ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Globe className="size-4.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">Online-only organisation</span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            Discoverable globally — a physical location is optional.
                          </span>
                        </span>
                      </span>
                      <Switch checked={onlineOnly} onCheckedChange={setOnlineOnly} aria-label="Online-only organisation" />
                    </button>

                    <div
                      className={cn(
                        "grid gap-3 transition-all duration-300",
                        onlineOnly ? "pointer-events-none max-h-0 opacity-0" : "max-h-96 opacity-100",
                      )}
                      aria-hidden={onlineOnly}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="City / Town">
                          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hounslow" className={INPUT_CLS} />
                        </Field>
                        <Field label="Region / State">
                          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Middlesex" className={INPUT_CLS} />
                        </Field>
                      </div>
                      <Field label="Country">
                        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United Kingdom" className={INPUT_CLS} />
                      </Field>
                    </div>
                  </Section>

                  {/* Contact & links */}
                  <Section title="Contact & links" hint="How people reach and follow your ministry.">
                    <Field label="Official website" error={websiteError}>
                      <IconInput
                        icon={<Globe className="size-4" />}
                        value={website}
                        onChange={setWebsite}
                        placeholder="kingdomacademyglobal.org"
                        invalid={Boolean(websiteError)}
                        inputMode="url"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Contact email" error={emailError}>
                        <IconInput
                          icon={<Mail className="size-4" />}
                          value={contactEmail}
                          onChange={setContactEmail}
                          placeholder="hello@ministry.org"
                          invalid={Boolean(emailError)}
                          type="email"
                        />
                      </Field>
                      <Field label="Contact phone">
                        <IconInput
                          icon={<Phone className="size-4" />}
                          value={contactPhone}
                          onChange={setContactPhone}
                          placeholder="Optional"
                          inputMode="tel"
                        />
                      </Field>
                    </div>
                  </Section>

                  {/* Social links */}
                  <Section title="Social links" hint="Optional — link the channels you're active on.">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Instagram">
                        <IconInput icon={<Camera className="size-4" />} value={instagram} onChange={setInstagram} placeholder="instagram.com/…" />
                      </Field>
                      <Field label="YouTube">
                        <IconInput icon={<Play className="size-4" />} value={youtube} onChange={setYoutube} placeholder="youtube.com/@…" />
                      </Field>
                      <Field label="Facebook">
                        <IconInput icon={<Users className="size-4" />} value={facebook} onChange={setFacebook} placeholder="facebook.com/…" />
                      </Field>
                      <Field label="X / Twitter">
                        <IconInput icon={<AtSign className="size-4" />} value={twitter} onChange={setTwitter} placeholder="x.com/…" />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Other link">
                          <IconInput icon={<Link2 className="size-4" />} value={otherLink} onChange={setOtherLink} placeholder="Any other link" />
                        </Field>
                      </div>
                    </div>
                  </Section>

                  {/* Story & beliefs */}
                  <Section title="Story & beliefs" hint="Share the heart behind your ministry.">
                    <Field label="Mission">
                      <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} placeholder="Why your ministry exists" className={TEXTAREA_CLS} />
                    </Field>
                    <Field label="Vision">
                      <textarea value={vision} onChange={(e) => setVision(e.target.value)} rows={2} placeholder="Where you're headed" className={TEXTAREA_CLS} />
                    </Field>
                    <Field label="Our story">
                      <textarea value={history} onChange={(e) => setHistory(e.target.value)} rows={3} placeholder="How you began" className={TEXTAREA_CLS} />
                    </Field>
                    <Field label="What we believe">
                      <textarea value={beliefs} onChange={(e) => setBeliefs(e.target.value)} rows={3} placeholder="Your statement of faith" className={TEXTAREA_CLS} />
                    </Field>
                  </Section>

                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              </div>

              {/* Live preview column (desktop) */}
              <aside className="hidden min-h-0 flex-col border-l border-border/60 bg-background lg:flex">
                <div className="flex items-center justify-between px-7 pb-4 pt-6">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Public profile
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Live preview
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8">
                  <ProfilePreview
                    org={org}
                    logo={logo}
                    cover={cover}
                    description={description}
                    onlineOnly={onlineOnly}
                    city={city}
                    region={region}
                    country={country}
                    website={website}
                    contactEmail={contactEmail}
                  />
                </div>
              </aside>
            </div>
          </div>

          {/* Footer */}
          <footer className="flex shrink-0 items-center gap-3 border-t border-border/60 bg-card/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:px-8 sm:pb-4">
            <div className="mr-auto hidden items-center gap-2 text-xs sm:flex" aria-live="polite">
              {saved ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                  <Check className="size-3.5" /> Saved
                </span>
              ) : dirty ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Unsaved changes
                </span>
              ) : null}
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              className="h-11 flex-1 rounded-xl sm:flex-none sm:px-6"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={pending || hasErrors || (!dirty && !saved)}
              className="h-11 flex-1 rounded-xl px-6 font-semibold shadow-lg shadow-primary/20 transition-transform active:scale-[0.98] sm:flex-none"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : saved ? (
                <>
                  <Check className="size-4" /> Saved
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </footer>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ------------------------------ Live preview ------------------------------ */

function ProfilePreview({
  org,
  logo,
  cover,
  description,
  onlineOnly,
  city,
  region,
  country,
  website,
  contactEmail,
}: {
  org: OrganizationView
  logo: string
  cover: string
  description: string
  onlineOnly: boolean
  city: string
  region: string
  country: string
  website: string
  contactEmail: string
}) {
  const location = orgLocationLabel(onlineOnly, city, region, country)
  const websiteHost = website.trim() ? website.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") : null
  const coverSrc = cover.trim() || logo.trim()

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-xl shadow-black/30">
      {/* Cover — a dedicated cover renders crisp; the logo fallback stays blurred. */}
      <div className="relative h-24 overflow-hidden">
        {coverSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc || "/placeholder.svg"}
              alt=""
              className={cn(
                "size-full object-cover",
                cover.trim() ? "opacity-90" : "scale-125 opacity-40 blur-2xl",
              )}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card" />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--primary) 26%, transparent) 0%, transparent 70%)",
            }}
          />
        )}
      </div>

      <div className="-mt-10 flex flex-col items-center px-5 pb-6 text-center">
        <div className="rounded-[20px] bg-background/70 p-1 shadow-xl ring-1 ring-white/10 backdrop-blur-sm">
          <span
            className={cn(
              "flex size-16 items-center justify-center overflow-hidden rounded-2xl text-xl font-bold text-white",
              !logo.trim() && org.color,
            )}
          >
            {logo.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo || "/placeholder.svg"} alt={org.name} className="size-full object-cover" />
            ) : (
              org.initials
            )}
          </span>
        </div>

        <h3 className="mt-3 inline-flex items-center gap-1.5 text-balance font-display text-lg font-bold tracking-tight text-foreground">
          {org.name}
          {org.verified && <VerifiedBadge size="sm" />}
        </h3>

        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/90">{org.categoryLabel}</span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span>{onlineOnly ? "Global" : org.reachLabel}</span>
        </div>

        {(location || onlineOnly) && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {onlineOnly ? <Building2 className="size-3.5 opacity-70" /> : <MapPin className="size-3.5 opacity-70" />}
            <span className="text-pretty">{location ?? "Online ministry"}</span>
          </div>
        )}

        {description.trim() ? (
          <p className="mt-3 line-clamp-4 text-pretty text-[13px] leading-relaxed text-muted-foreground">
            {description.trim()}
          </p>
        ) : (
          <p className="mt-3 text-[13px] italic leading-relaxed text-muted-foreground/40">
            Your description will appear here.
          </p>
        )}

        <div className="mt-4 flex w-full flex-col gap-2">
          <span className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            Subscribe
          </span>
          <div className="flex gap-2">
            {websiteHost && (
              <span className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 truncate rounded-full border border-border/70 bg-secondary/40 px-3 text-xs font-semibold text-foreground">
                <Globe className="size-3.5 shrink-0 opacity-80" />
                Website
              </span>
            )}
            {contactEmail.trim() && (
              <span className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border/70 bg-secondary/40 px-3 text-xs font-semibold text-foreground">
                <Mail className="size-3.5 shrink-0 opacity-80" />
                Contact
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Primitives ------------------------------ */

const INPUT_CLS =
  "h-11 w-full rounded-xl border border-border/50 bg-background/40 px-3.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/60 focus:bg-background/70 focus:ring-4 focus:ring-primary/10"

const TEXTAREA_CLS =
  "w-full resize-none rounded-xl border border-border/50 bg-background/40 p-3.5 text-[15px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/60 focus:bg-background/70 focus:ring-4 focus:ring-primary/10"

function IconInput({
  icon,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  invalid,
}: {
  icon: React.ReactNode
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  inputMode?: "url" | "tel" | "email" | "text"
  invalid?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">{icon}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={cn(INPUT_CLS, "pl-10", invalid && "border-destructive/70 focus:border-destructive focus:ring-destructive/10")}
      />
    </div>
  )
}

function Field({
  label,
  hint,
  error,
  count,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  count?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[13px] font-medium text-foreground/80">{label}</label>
        {count}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-snug text-muted-foreground/70">{hint}</p>
      ) : null}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border/40 pt-8 first:border-0 first:pt-0">
      <div className="space-y-1">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-foreground">{title}</h3>
        {hint && <p className="text-xs leading-snug text-muted-foreground/70">{hint}</p>}
      </div>
      {children}
    </section>
  )
}


