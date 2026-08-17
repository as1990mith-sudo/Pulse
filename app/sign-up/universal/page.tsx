import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"

// Frequency Universal — the individual account path. Organisations use the
// dedicated Home onboarding at /sign-up/home, so this form is locked to
// individuals and never exposes the organisation toggle.
export default async function UniversalSignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/feed")
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  return <AuthForm mode="sign-up" googleEnabled={googleEnabled} individualOnly />
}
