"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, FileEdit, Pencil, Plus, ScrollText, Search, Send, Trash2 } from "lucide-react"
import { CampaignStatusBadge } from "@/components/campaign-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useDbQuery } from "@/hooks/use-db-table"
import { db, type EmailList, type Newsletter } from "@/lib/db"
import {
  campaignNewPath,
  campaignPhasePath,
  campaignWorkspacePath,
  copyName,
  filterCampaigns,
} from "@/lib/operator"
import { toast } from "sonner"

export function CampaignList() {
  const router = useRouter()
  const [campaignQuery, setCampaignQuery] = useState("")
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const loadCampaigns = useCallback(async () => {
    const [newsletters, lists] = await Promise.all([
      db.newsletters.orderBy("createdAt").reverse().toArray(),
      db.emailLists.toArray(),
    ])
    return { newsletters, lists }
  }, [])

  const { data, reload, error } = useDbQuery(loadCampaigns, {
    newsletters: [] as Newsletter[],
    lists: [] as EmailList[],
  })
  const newsletters = data.newsletters
  const lists = data.lists
  const visibleNewsletters = filterCampaigns(newsletters, campaignQuery)

  useEffect(() => {
    if (error) toast.error(`Could not load campaigns: ${error}`)
  }, [error])

  async function confirmDelete() {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    await db.sendLogs.where("newsletterId").equals(id).delete()
    await db.newsletters.delete(id)
    toast.success("Campaign deleted")
    void reload()
  }

  async function handleDuplicate(nl: Newsletter) {
    await db.newsletters.add({
      ...nl,
      id: undefined,
      name: copyName(nl.name),
      status: "draft",
      sentAt: null,
      createdAt: new Date(),
    })
    toast.success("Campaign duplicated")
    void reload()
  }

  return (
    <div className="content-area">
      <div className="section-header">
        <div>
          <h2 className="section-title">Campaigns</h2>
          <p className="section-description">Create, send, and review your email campaigns</p>
        </div>
        <Button onClick={() => router.push(campaignNewPath())}>
          <Plus className="mr-2 size-4" />
          New Campaign
        </Button>
      </div>

      {newsletters.length === 0 ? (
        <Card className="compact-card">
          <CardContent className="empty-state">
            <div className="empty-state-icon">
              <FileEdit className="size-7" />
            </div>
            <CardTitle className="empty-state-title">No campaigns yet</CardTitle>
            <CardDescription className="empty-state-description">
              Create your first campaign to start sending emails
            </CardDescription>
            <Button onClick={() => router.push(campaignNewPath())}>
              <Plus className="mr-2 size-4" />
              New Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="compact-card">
          <CardContent className="p-0">
            {newsletters.length > 1 && (
              <div className="border-b px-3 py-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={campaignQuery}
                    onChange={(e) => setCampaignQuery(e.target.value)}
                    placeholder="Search campaigns by name or subject"
                    className="pl-8"
                    aria-label="Search campaigns"
                  />
                </div>
              </div>
            )}
            {visibleNewsletters.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No campaigns match that search.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Lists</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleNewsletters.map((nl) => (
                    <TableRow
                      key={nl.id}
                      className="cursor-pointer"
                      onClick={() => {
                        if (nl.id != null) router.push(campaignWorkspacePath(nl.id))
                      }}
                    >
                      <TableCell className="font-medium">{nl.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{nl.subject}</TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={nl.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {nl.listIds.map((lid) => {
                            const list = lists.find((item) => item.id === lid)
                            return list ? (
                              <Badge key={lid} variant="outline" className="text-xs">
                                {list.name}
                              </Badge>
                            ) : null
                          })}
                          {nl.listIds.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {nl.createdAt ? new Date(nl.createdAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <TooltipProvider>
                          <div className="flex items-center justify-end gap-1">
                            {nl.status === "draft" && nl.id != null && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Edit campaign"
                                    onClick={() => router.push(campaignPhasePath(nl.id!, "compose"))}
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit campaign</TooltipContent>
                              </Tooltip>
                            )}
                            {nl.id != null && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Send campaign"
                                    onClick={() => router.push(campaignPhasePath(nl.id!, "send"))}
                                  >
                                    <Send className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send campaign</TooltipContent>
                              </Tooltip>
                            )}
                            {nl.status !== "draft" && nl.id != null && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="View send logs"
                                    onClick={() => router.push(campaignPhasePath(nl.id!, "logs"))}
                                  >
                                    <ScrollText className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View send logs</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Duplicate campaign"
                                  onClick={() => void handleDuplicate(nl)}
                                >
                                  <Copy className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate campaign</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Delete campaign"
                                  onClick={() => setPendingDeleteId(nl.id!)}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete campaign</TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This action deletes the campaign and all related send logs. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Delete campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
