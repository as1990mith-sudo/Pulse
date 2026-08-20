import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Radio } from "lucide-react"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"
import { SignupChooser } from "@/components/signup-chooser"

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/feed")

  const { next } = await searchParams

  // When the visitor arrived from a "join a Home" link (a Home key in `next`),
  // they have already chosen their organisation — so skip the org-vs-individual
  // chooser and show a straight member sign-up that returns them to the join
  // confirmation, dropping them inside that Home.
  if (next) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-6 py-12">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Radio className="size-6" />
          </span>
          <h1 className="text-2xl font-semibold text-balance">Join your Home</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Create your account to join the Home you were invited to.
          </p>
        </div>
        <div className="w-full max-w-sm">
          <AuthForm mode="sign-up" individualOnly next={next} />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={`/sign-in?next=${encodeURIComponent(next)}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    )
  }

  return <SignupChooser />
}
