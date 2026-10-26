"use client"

import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

export function AuthForm({ signUp = false }: { signUp?: boolean }) {
  const router = useRouter()
  const submitting = useRef(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setError("")
    const fields = new FormData(event.currentTarget)
    const credentials = {
      email: String(fields.get("email")).trim(),
      password: String(fields.get("password")),
    }
    try {
      const result = signUp
        ? await authClient.signUp.email({
            ...credentials,
            name: String(fields.get("name")).trim(),
          })
        : await authClient.signIn.email(credentials)
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many attempts. Wait a moment and try again."
            : result.error.status >= 500
              ? "Sign in is temporarily unavailable. Please try again shortly."
              : signUp
                ? "Could not create your account. Check your details or try signing in."
                : "The email or password is incorrect. Please try again."
        )
      } else {
        router.replace("/")
        router.refresh()
      }
    } catch {
      setError("Unable to connect. Check your connection and try again.")
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#202923] p-12 text-[#f5f5ed] lg:flex xl:p-16">
        <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <span className="flex size-10 items-center justify-center rounded-xl border border-white/20">
            <Image
              src="/icon.png"
              alt=""
              width={32}
              height={32}
              className="size-8"
            />
          </span>
          open-mochi
        </div>
        <div className="max-w-lg py-20">
          <p className="mb-6 text-xs font-medium tracking-[0.2em] text-[#c5d0b6] uppercase">
            A workspace of your own
          </p>
          <h2 className="text-5xl leading-[1.1] font-medium tracking-[-0.045em] xl:text-6xl">
            Good ideas deserve
            <br />a little company.
          </h2>
          <p className="mt-6 max-w-sm text-base leading-7 text-white/65">
            Meet your bots. Pick up a conversation. Make room for what comes
            next.
          </p>
          <div className="mt-12 rounded-2xl border border-white/15 bg-white/5 p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[#dbe6c9] text-[#202923]">
                <Image
                  src="/icon.png"
                  alt=""
                  width={28}
                  height={28}
                  className="size-7"
                />
              </span>
              <div>
                <p className="text-sm font-medium">Your next collaborator</p>
                <p className="text-xs text-white/50">Ready when you are</p>
              </div>
              <span
                className="ml-auto size-2 rounded-full bg-[#c5d0b6]"
                aria-hidden="true"
              />
            </div>
            <p className="text-sm leading-6 text-white/75">
              “What are we working on today?”
            </p>
          </div>
        </div>
        <p className="text-xs text-white/45">
          Your bots. Your conversations. Your space.
        </p>
      </aside>

      <section className="flex flex-col bg-muted/25 px-6 py-8 sm:px-12 lg:px-16">
        <div className="flex items-center gap-2 text-sm font-semibold lg:hidden">
          <Image
            src="/icon.png"
            alt=""
            width={32}
            height={32}
            className="size-8"
          />
          open-mochi
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px]">
            <div className="mb-8">
              <span className="mb-6 flex size-12 items-center justify-center rounded-2xl border bg-background shadow-xs">
                <Image
                  src="/icon.png"
                  alt=""
                  width={32}
                  height={32}
                  className="size-8"
                />
              </span>
              <h1 className="text-3xl font-semibold tracking-tight">
                {signUp ? "Make yourself at home." : "Welcome back."}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {signUp
                  ? "Create an account and meet your first bot."
                  : "Sign in to pick up where you left off."}
              </p>
            </div>
            <form
              onSubmit={submit}
              aria-busy={pending}
              aria-describedby={error ? "auth-error" : undefined}
            >
              <fieldset disabled={pending} className="space-y-6">
                <FieldGroup>
                  {signUp && (
                    <Field>
                      <FieldLabel htmlFor="name">Your name</FieldLabel>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        placeholder="Alex Morgan"
                        required
                        maxLength={100}
                        className="h-12 bg-background px-3.5"
                      />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="email">Email address</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="you@example.com"
                      required
                      className="h-12 bg-background px-3.5"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          signUp ? "new-password" : "current-password"
                        }
                        minLength={signUp ? 12 : undefined}
                        maxLength={128}
                        required
                        aria-describedby={signUp ? "password-help" : undefined}
                        className="h-12 bg-background pr-12 pl-3.5"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOffIcon aria-hidden="true" />
                        ) : (
                          <EyeIcon aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                    {signUp && (
                      <FieldDescription id="password-help">
                        Use 12–128 characters. A few words work well.
                      </FieldDescription>
                    )}
                  </Field>
                </FieldGroup>
                {error && (
                  <FieldError
                    id="auth-error"
                    className="rounded-lg border border-destructive/20 bg-destructive/5 p-3"
                  >
                    {error}
                  </FieldError>
                )}
                <Button
                  type="submit"
                  disabled={pending}
                  className="h-12 w-full gap-2 text-sm"
                >
                  {pending ? (
                    <LoaderCircleIcon
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {pending
                    ? signUp
                      ? "Creating your account…"
                      : "Signing in…"
                    : signUp
                      ? "Create account"
                      : "Sign in"}{" "}
                  {!pending && <ArrowRightIcon aria-hidden="true" />}
                </Button>
              </fieldset>
            </form>
            <p className="mt-7 text-center text-sm text-muted-foreground">
              {signUp ? "Already have an account?" : "New around here?"}{" "}
              <Link
                href={signUp ? "/sign-in" : "/sign-up"}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {signUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>
        </div>
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <LockKeyholeIcon className="size-3.5" aria-hidden="true" />A space for
          you and your bots.
        </p>
      </section>
    </main>
  )
}
