import { Badge } from "@/components/ui/badge"
import type { Newsletter } from "@/lib/db"
import { campaignStatusLabel } from "@/lib/send-engine"

export function CampaignStatusBadge({ status }: { status: Newsletter["status"] }) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary">{campaignStatusLabel(status)}</Badge>
    case "sending":
      return <Badge className="bg-warning text-warning-foreground">{campaignStatusLabel(status)}</Badge>
    case "sent":
      return <Badge className="bg-success text-success-foreground">{campaignStatusLabel(status)}</Badge>
    case "sent_with_errors":
      return <Badge className="bg-warning text-warning-foreground">{campaignStatusLabel(status)}</Badge>
    default:
      return <Badge variant="outline">{campaignStatusLabel(status)}</Badge>
  }
}
