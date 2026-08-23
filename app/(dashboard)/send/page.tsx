"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { campaignListPath, campaignPhasePath } from "@/lib/operator"
import { useSending } from "@/lib/sending-context"

export default function SendRedirectPage() {
  const router = useRouter()
  const { sending, activeNewsletterId } = useSending()

  useEffect(() => {
    if (sending && activeNewsletterId != null) {
      router.replace(campaignPhasePath(activeNewsletterId, "send"))
      return
    }
    router.replace(campaignListPath())
  }, [sending, activeNewsletterId, router])

  return <p className="text-sm text-muted-foreground">Opening campaigns…</p>
}
