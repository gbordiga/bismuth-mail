"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { CampaignCompose } from "@/components/newsletter-editor"
import { CampaignWorkspace } from "@/components/campaign-workspace"
import { campaignListPath, parseCampaignId } from "@/lib/operator"

export default function CampaignComposePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = parseCampaignId(String(params.id ?? ""))

  useEffect(() => {
    if (campaignId == null) router.replace(campaignListPath())
  }, [campaignId, router])

  if (campaignId == null) return null

  return (
    <CampaignWorkspace campaignId={campaignId} phase="compose">
      <CampaignCompose campaignId={campaignId} />
    </CampaignWorkspace>
  )
}
