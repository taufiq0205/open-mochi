import { auth } from "@clerk/nextjs/server"

export default async function DashboardPage() {
  await auth.protect()

  return (
    <main className="flex min-h-svh flex-col gap-4 p-6">
      <h1 className="font-medium">Dashboard</h1>
      <p>
        You are signed in. Use your profile menu to manage your account or sign
        out.
      </p>
    </main>
  )
}
