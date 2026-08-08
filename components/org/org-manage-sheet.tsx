"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Settings2 } from "lucide-react"
import { updateOrganization } from "@/app/actions/organizations"
import type { OrganizationView } from "@/lib/org-types"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

/**
 * Owner-only management sheet: edit description, location, website, social
 * links, contact details and the About sections in one place. Persists via the
 * owner-scoped `updateOrganization` server action.
 */
export function OrgManageSheet({ org }: { org: OrganizationView }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [description, setDescription] = useState(org.description ?? "")
  const [onlineOnly, setOnlineOnly] = useState(org.onlineOnly)
  const [city, setCity] = useState(org.city ?? "")
  const [region, setRegion] = useState(org.region ?? "")
  const [country, setCountry] = useState(org.country ?? "")
  const [website, setWebsite] = useState(org.website ?? "")
  const [contactEmail, setContactEmail] = useState(org.contactEmail ?? "")
  const [contactPhone, setContactPhone] = useState(org.contactPhone ?? "")

  const [instagram, setInstagram] = useState(org.socials?.instagram ?? "")
  const [youtube, setYoutube] = useState(org.socials?.youtube ?? "")
  const [facebook, setFacebook] = useState(org.socials?.facebook ?? "")
  const [twitter, setTwitter] = useState(org.socials?.twitter ?? "")
  const [otherLink, setOtherLink] = useState(org.socials?.other ?? "")

  const [mission, setMission] = useState(org.mission ?? "")
  const [vision, setVision] = useState(org.vision ?? "")
  const [history, setHistory] = useState(org.history ?? "")
  const [beliefs, setBeliefs] = useState(org.beliefs ?? "")

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await updateOrganization(org.id, {
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
        setOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save your changes. Please try again.")
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Manage organisation"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="size-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Manage organisation</SheetTitle>
          <SheetDescription>Update your details so people can find, understand and reach your ministry.</SheetDescription>
        </SheetHeader>

        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 py-4">
          <Field label="Short description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="A sentence about your ministry" />
          </Field>

          <Group title="Location">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="pr-3">
                <p className="text-sm font-medium">Online-only organisation</p>
                <p className="text-xs leading-tight text-muted-foreground">Discoverable globally, location optional</p>
              </div>
              <Switch checked={onlineOnly} onCheckedChange={setOnlineOnly} aria-label="Online-only organisation" />
            </div>
            {!onlineOnly && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="City/Town">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Region/State">
                  <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Optional" />
                </Field>
                <div className="col-span-2">
                  <Field label="Country">
                    <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Optional" />
                  </Field>
                </div>
              </div>
            )}
          </Group>

          <Group title="Links & contact">
            <Field label="Official website">
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourministry.org" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact email">
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="hello@…" />
              </Field>
              <Field label="Contact phone">
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Optional" />
              </Field>
            </div>
          </Group>

          <Group title="Social links">
            <div className="grid grid-cols-1 gap-3">
              <Field label="Instagram">
                <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="instagram.com/…" />
              </Field>
              <Field label="YouTube">
                <Input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="youtube.com/@…" />
              </Field>
              <Field label="Facebook">
                <Input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="facebook.com/…" />
              </Field>
              <Field label="X / Twitter">
                <Input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="x.com/…" />
              </Field>
              <Field label="Other link">
                <Input value={otherLink} onChange={(e) => setOtherLink(e.target.value)} placeholder="Any other link" />
              </Field>
            </div>
          </Group>

          <Group title="About">
            <Field label="Mission">
              <Textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} placeholder="Why your ministry exists" />
            </Field>
            <Field label="Vision">
              <Textarea value={vision} onChange={(e) => setVision(e.target.value)} rows={2} placeholder="Where you're headed" />
            </Field>
            <Field label="Our story">
              <Textarea value={history} onChange={(e) => setHistory(e.target.value)} rows={3} placeholder="How you began" />
            </Field>
            <Field label="What we believe">
              <Textarea value={beliefs} onChange={(e) => setBeliefs(e.target.value)} rows={3} placeholder="Your statement of faith" />
            </Field>
          </Group>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="sticky bottom-0 -mx-1 flex gap-3 border-t border-border/60 bg-background/95 px-1 py-3 backdrop-blur">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1 rounded-full">
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={pending} className="flex-1 rounded-full">
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}
