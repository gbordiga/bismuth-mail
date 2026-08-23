import { CampaignCompose } from "@/components/newsletter-editor"
import { CampaignWorkspace } from "@/components/campaign-workspace"

export default function NewCampaignPage() {
  return (
    <CampaignWorkspace campaignId={null} phase="compose">
      <CampaignCompose campaignId={null} />
    </CampaignWorkspace>
  )
}
