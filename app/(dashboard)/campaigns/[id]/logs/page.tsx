"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { CampaignSendLogs } from "@/components/campaign-send-logs"
import { CampaignWorkspace } from "@/components/campaign-workspace"
import { campaignListPath, parseCampaignId } from "@/lib/operator"

export default function CampaignLogsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = parseCampaignId(String(params.id ?? ""))

  useEffect(() => {
    if (campaignId == null) router.replace(campaignListPath())
  }, [campaignId, router])

  if (campaignId == null) return null

  return (
    <CampaignWorkspace campaignId={campaignId} phase="logs">
      <CampaignSendLogs campaignId={campaignId} />
    </CampaignWorkspace>
  )
}
