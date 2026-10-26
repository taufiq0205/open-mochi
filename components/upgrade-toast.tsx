"use client"

import Link from "next/link"
import { toast } from "@/components/ui/toast"
import { USAGE_ERROR } from "@/lib/usage-policy"
import { BILLING_ERROR } from "@/lib/billing"

export function showUpgradeToast() {
  toast.add({
    id: "paid-plan-required",
    type: "error",
    title: "Pro plan required",
    description: (
      <>
        {BILLING_ERROR}{" "}
        <Link href="/pricing" className="underline">
          View plans
        </Link>
      </>
    ),
  })
}

export function showUsageToast(message = USAGE_ERROR) {
  toast.add({
    id: "usage-limit",
    type: "error",
    title: "Usage limit",
    description: (
      <>
        {message}{" "}
        <Link href="/usage" className="underline">
          View Usage
        </Link>
      </>
    ),
  })
}
