"use client"

import { useEffect, useState, type MouseEvent, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { liveQuery } from "dexie"
import { ArrowLeft } from "lucide-react"
import { CampaignLeaveProvider, useCampaignLeave } from "@/components/campaign-leave-context"
import { CampaignStatusBadge } from "@/components/campaign-status-badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { db, type Newsletter } from "@/lib/db"
import {
  campaignListPath,
  campaignPhasePath,
  type CampaignPhase,
} from "@/lib/operator"
import { cn } from "@/lib/utils"

const PHASES: Array<{ id: CampaignPhase; label: string }> = [
  { id: "compose", label: "Compose" },
  { id: "send", label: "Send" },
  { id: "logs", label: "Logs" },
]

export function CampaignWorkspace({
  campaignId,
  phase,
  children,
}: {
  campaignId: number | null
  phase: CampaignPhase
  children: ReactNode
}) {
  return (
    <CampaignLeaveProvider>
      <CampaignWorkspaceChrome campaignId={campaignId} phase={phase}>
        {children}
      </CampaignWorkspaceChrome>
    </CampaignLeaveProvider>
  )
}

function CampaignWorkspaceChrome({
  campaignId,
  phase,
  children,
}: {
  campaignId: number | null
  phase: CampaignPhase
  children: ReactNode
}) {
  const router = useRouter()
  const { hasLeaveGuard, tryLeave } = useCampaignLeave()
  const [campaign, setCampaign] = useState<Newsletter | null>(null)

  useEffect(() => {
    if (campaignId == null) return
    const subscription = liveQuery(() => db.newsletters.get(campaignId)).subscribe({
      next: (row) => setCampaign(row ?? null),
    })
    return () => subscription.unsubscribe()
  }, [campaignId])

  function handleGuardedNav(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!hasLeaveGuard) return
    event.preventDefault()
    void tryLeave().then((ok) => {
      if (ok) router.push(href)
    })
  }

  const title = campaign?.name.trim() || (campaignId == null ? "New campaign" : "Campaign")
  const phasesEnabled = campaignId != null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Back to campaigns" asChild>
                  <Link href={campaignListPath()} onClick={(event) => handleGuardedNav(event, campaignListPath())}>
                    <ArrowLeft className="size-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to campaigns</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
          {campaign ? <CampaignStatusBadge status={campaign.status} /> : null}
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {PHASES.map((item) => {
            const active = phase === item.id
            const disabled = !phasesEnabled && item.id !== "compose"
            const href = campaignId != null ? campaignPhasePath(campaignId, item.id) : null
            return (
              <Button
                key={item.id}
                type="button"
                variant={active ? "secondary" : "ghost"}
                size="sm"
                disabled={disabled}
                aria-current={active ? "page" : undefined}
                className={cn("flex-1 sm:flex-none", active && "bg-background shadow-sm")}
                asChild={href != null && !disabled}
              >
                {href != null && !disabled ? (
                  <Link
                    href={href}
                    onClick={(event) => {
                      if (active) {
                        event.preventDefault()
                        return
                      }
                      handleGuardedNav(event, href)
                    }}
                  >
                    {item.label}
                  </Link>
                ) : (
                  item.label
                )}
              </Button>
            )
          })}
        </div>
      </div>
      {children}
    </div>
  )
}
