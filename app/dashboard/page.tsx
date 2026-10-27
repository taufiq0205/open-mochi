import { requireSession } from "@/lib/session"

export default async function DashboardPage() {
  await requireSession()

  return (
    <main className="flex min-h-svh flex-col gap-4 p-6">
      <h1 className="font-medium">Dashboard</h1>
      <p>You are signed in. Use the sidebar to open your chats or sign out.</p>
    </main>
  )
}
