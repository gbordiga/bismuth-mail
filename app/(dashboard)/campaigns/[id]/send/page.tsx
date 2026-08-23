"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { CampaignWorkspace } from "@/components/campaign-workspace"
import { CampaignSend } from "@/components/send-campaign"
import { campaignListPath, parseCampaignId } from "@/lib/operator"

export default function CampaignSendPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = parseCampaignId(String(params.id ?? ""))

  useEffect(() => {
    if (campaignId == null) router.replace(campaignListPath())
  }, [campaignId, router])

  if (campaignId == null) return null

  return (
    <CampaignWorkspace campaignId={campaignId} phase="send">
      <CampaignSend campaignId={campaignId} />
    </CampaignWorkspace>
  )
}
