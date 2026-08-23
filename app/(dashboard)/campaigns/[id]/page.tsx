"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { db } from "@/lib/db"
import { campaignDefaultPhase, campaignListPath, campaignPhasePath, parseCampaignId } from "@/lib/operator"

export default function CampaignIndexPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    const id = parseCampaignId(String(params.id ?? ""))
    if (id == null) {
      router.replace(campaignListPath())
      return
    }
    void db.newsletters.get(id).then((campaign) => {
      if (!campaign) {
        router.replace(campaignListPath())
        return
      }
      router.replace(campaignPhasePath(id, campaignDefaultPhase(campaign.status)))
    })
  }, [params.id, router])

  return <p className="text-sm text-muted-foreground">Opening campaign…</p>
}
