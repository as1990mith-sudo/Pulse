import type { Metadata } from "next"
import { redirect } from "next/navigation"
import {
  BadgeCheck,
  Bell,
  CalendarDays,
  Database,
  Info,
  LifeBuoy,
  Lock,
  Mail,
  Scale,
  ShieldCheck,
  User,
} from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { AvatarUploadButton } from "@/components/profile/avatar-upload-button"
import { AccountGroup, AccountInfoRow, AccountRow } from "@/components/account/account-ui"
import { getMyAccountInfo } from "@/app/actions/account"
import { getAvatarColor, getInitials } from "@/lib/identity"

export const metadata: Metadata = {
  title: "Account · Frequency Home",
  description: "Your personal account, identity, privacy, and security.",
}

export default async function AccountPage() {
  const info = await getMyAccountInfo()
  if (!info) redirect("/sign-in")

  const memberSince = new Date(info.createdAt).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:px-6">
        <header className="mb-8 flex items-center gap-4">
          <AvatarUploadButton
            image={info.image}
            initials={getInitials(info.name)}
            color={getAvatarColor(info.id)}
            name={info.name}
            sizeClass="size-16 text-xl"
          />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{info.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{info.handle}</p>
          </div>
        </header>

        <AccountGroup>
          <AccountRow href="/account/profile" icon={User} label="Profile" />
          <AccountRow href="/account/privacy" icon={ShieldCheck} label="Privacy" />
          <AccountRow href="/account/security" icon={Lock} label="Security" />
          <AccountRow href="/account/notifications" icon={Bell} label="Notifications" />
          <AccountRow href="/account/data" icon={Database} label="Data & Privacy" />
        </AccountGroup>

        <AccountGroup>
          <AccountRow href="/account/support" icon={LifeBuoy} label="Support" />
          <AccountRow href="/account/about" icon={Info} label="About Frequency Home" />
          <AccountRow href="/account/legal" icon={Scale} label="Legal" />
        </AccountGroup>

        <AccountGroup label="Account information">
          <AccountInfoRow icon={Mail} label="Email" value={info.email} />
          <AccountInfoRow
            icon={BadgeCheck}
            label="Verification"
            valueSlot={
              <span
                className={
                  info.emailVerified
                    ? "inline-flex items-center gap-1 text-sm font-medium text-primary"
                    : "text-sm text-muted-foreground"
                }
              >
                {info.emailVerified ? "Verified" : "Unverified"}
              </span>
            }
          />
          <AccountInfoRow icon={CalendarDays} label="Member since" value={memberSince} />
        </AccountGroup>
      </main>
    </div>
  )
}
