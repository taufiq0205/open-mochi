import { notFound } from "next/navigation"
import { Suspense } from "react"
import { UIPrototype } from "./prototype"

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <Suspense>
      <UIPrototype />
    </Suspense>
  )
}
