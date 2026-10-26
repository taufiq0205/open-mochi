import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { AuthForm } from "@/components/auth-form"

export default async function Page() {
  if (await getSession()) redirect("/")
  return <AuthForm />
}
