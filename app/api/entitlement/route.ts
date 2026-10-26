import { getSession } from "@/lib/session"
import { requirePaidUser } from "@/lib/paid-plan"
import { BILLING_ERROR } from "@/lib/billing"

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ paid: false }, { status: 401 })
  try {
    await requirePaidUser(session.user.id)
    return Response.json(
      { paid: true },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof Error && error.message === BILLING_ERROR)
      return Response.json(
        { paid: false },
        { headers: { "Cache-Control": "no-store" } }
      )
    return Response.json({ paid: false }, { status: 503 })
  }
}
