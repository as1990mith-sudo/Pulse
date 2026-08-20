import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

// Individuals can only join Frequency through an organisation's Home key, so the
// keyless individual sign-up no longer exists — this route now forwards to the
// key-entry flow, which collects the key first and then creates the account.
export default async function UniversalSignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/feed")
  redirect("/home/join")
}
