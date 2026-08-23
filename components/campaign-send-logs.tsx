"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { liveQuery } from "dexie"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Eye,
  FileJson,
  ScrollText,
  XCircle,
  Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { downloadCsv, downloadJson } from "@/lib/csv"
import { db, type Newsletter, type SendLog } from "@/lib/db"
import { countUniqueActiveRecipients, loadSendLogsByNewsletter } from "@/lib/repositories/campaign-repository"
import { campaignPhasePath, filterSendLogs } from "@/lib/operator"
import { summarizeSendLogs } from "@/lib/send-engine"
import {
  listValidationIssues,
  sendLogErrorFilename,
  serializeSendLogError,
  serializeSendLogErrors,
} from "@/lib/send-error"
import { toast } from "sonner"

const LOG_PAGE_SIZE = 50

interface ErrorDiagnostic {
  category: string
  count: number
  suggestion: string
  severity: "warning" | "error"
}

function diagnoseErrors(logs: SendLog[]): ErrorDiagnostic[] {
  const failed = logs.filter((log) => log.status === "failed" && log.error)
  if (failed.length === 0) return []

  const categories: Record<string, { count: number; suggestion: string; severity: "warning" | "error" }> = {}

  for (const log of failed) {
    const err = (log.error || "").toLowerCase()

    if (/auth|535|534|login|credential/i.test(err)) {
      const key = "Authentication failed"
      categories[key] = categories[key] || {
        count: 0,
        suggestion:
          "Check your SMTP username and password. If using Gmail/Outlook, you need an App Password (not your account password).",
        severity: "error",
      }
      categories[key].count++
    } else if (/421|450|too many|rate|throttl/i.test(err)) {
      const key = "Rate limited by server"
      categories[key] = categories[key] || {
        count: 0,
        suggestion:
          "Your SMTP server is throttling sends. Increase the 'Delay' setting (try 100-500ms) and reduce 'Connections' (try 2-3).",
        severity: "warning",
      }
      categories[key].count++
    } else if (/econnection|econnrefused|econnreset|etimedout|timeout/i.test(err)) {
      const key = "Connection error"
      categories[key] = categories[key] || {
        count: 0,
        suggestion:
          "Cannot connect to the SMTP server. Verify host and port are correct, and check your firewall or network. Try testing the connection first.",
        severity: "error",
      }
      categories[key].count++
    } else if (/certificate|tls|starttls|ssl/i.test(err)) {
      const key = "TLS/SSL error"
      categories[key] = categories[key] || {
        count: 0,
        suggestion:
          "TLS handshake failed. Try toggling the TLS setting in your SMTP config, or switch between ports 587 (STARTTLS) and 465 (TLS).",
        severity: "error",
      }
      categories[key].count++
    } else if (/550|553|mailbox|user unknown|recipient|does not exist/i.test(err)) {
      const key = "Invalid recipient"
      categories[key] = categories[key] || {
        count: 0,
        suggestion:
          "Some email addresses are invalid or the recipient's mailbox doesn't exist. Remove these contacts from your list.",
        severity: "warning",
      }
      categories[key].count++
    } else if (/452|quota|storage|disk/i.test(err)) {
      const key = "Server quota exceeded"
      categories[key] = categories[key] || {
        count: 0,
        suggestion:
          "Your SMTP server's sending quota is full. Wait and try again later, or contact your email provider to increase limits.",
        severity: "error",
      }
      categories[key].count++
    } else if (/epipe|esocket|socket/i.test(err)) {
      const key = "Connection dropped"
      categories[key] = categories[key] || {
        count: 0,
        suggestion:
          "The connection was dropped mid-send. This is usually transient — the retry mechanism should handle it. If persistent, reduce 'Connections' to 2-3.",
        severity: "warning",
      }
      categories[key].count++
    } else {
      const key = "Other error"
      categories[key] = categories[key] || {
        count: 0,
        suggestion: "Check the error details in the send log below for more information.",
        severity: "warning",
      }
      categories[key].count++
    }
  }

  return Object.entries(categories)
    .map(([category, value]) => ({ category, ...value }))
    .sort((a, b) => b.count - a.count)
}

export function CampaignSendLogs({ campaignId }: { campaignId: number }) {
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [sendLogs, setSendLogs] = useState<SendLog[]>([])
  const [recipientCount, setRecipientCount] = useState(0)
  const [logFilter, setLogFilter] = useState<"all" | "sent" | "failed">("all")
  const [logQuery, setLogQuery] = useState("")
  const [logPageState, setLogPageState] = useState({ key: `${campaignId}::all::`, page: 1 })
  const [errorDialogLog, setErrorDialogLog] = useState<SendLog | null>(null)
  const pageKey = `${campaignId}::${logFilter}::${logQuery}`
  const logPage = logPageState.key === pageKey ? logPageState.page : 1

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const campaign = await db.newsletters.get(campaignId)
      const logs = await loadSendLogsByNewsletter(campaignId)
      const contacts = campaign ? await countUniqueActiveRecipients(campaign.listIds) : 0
      return { campaign: campaign ?? null, logs, contacts }
    }).subscribe({
      next: (value) => {
        setNewsletter(value.campaign)
        setSendLogs(value.logs)
        setRecipientCount(value.contacts)
      },
    })
    return () => subscription.unsubscribe()
  }, [campaignId])

  const filteredLogs = filterSendLogs(sendLogs, logFilter, logQuery)
  const failedCount = sendLogs.filter((log) => log.status === "failed").length
  const failedLogs = filteredLogs.filter((log) => log.status === "failed")
  const diagnostics = diagnoseErrors(sendLogs)
  const campaignSlug = newsletter?.name.replace(/\s+/g, "-").toLowerCase() ?? "campaign"

  function handleExportLogs() {
    if (!newsletter) return
    if (filteredLogs.length === 0) {
      toast.info("No send log rows match the current search and filter")
      return
    }
    downloadCsv(`${campaignSlug}-send-log.csv`, [
      ["email", "name", "status", "attempt", "error", "errorDetail", "sentAt"],
      ...filteredLogs.map((log) => [
        log.contactEmail,
        log.contactName,
        log.status,
        String(log.attempt),
        log.error ?? "",
        log.errorDetail ?? "",
        log.sentAt ? new Date(log.sentAt).toISOString() : "",
      ]),
    ])
    toast.success(`Exported ${filteredLogs.length} send log rows`)
  }

  function handleDownloadError(log: SendLog) {
    downloadJson(sendLogErrorFilename(log.contactEmail), serializeSendLogError(log))
    toast.success(`Downloaded error for ${log.contactEmail}`)
  }

  function handleDownloadFailedErrors() {
    if (failedLogs.length === 0) {
      toast.info("No failed send log rows match the current search and filter")
      return
    }
    downloadJson(`${campaignSlug}-send-errors.json`, serializeSendLogErrors(failedLogs))
    toast.success(`Downloaded ${failedLogs.length} error report${failedLogs.length !== 1 ? "s" : ""}`)
  }

  async function handleCopyError(log: SendLog) {
    try {
      await navigator.clipboard.writeText(serializeSendLogError(log))
      toast.success("Copied full error to clipboard")
    } catch {
      toast.error("Could not copy the error")
    }
  }

  if (sendLogs.length === 0) {
    return (
      <Card className="compact-card">
        <CardContent className="empty-state">
          <div className="empty-state-icon">
            <ScrollText className="size-7" />
          </div>
          <p className="empty-state-title">No send yet</p>
          <p className="empty-state-description">This campaign has no delivery history. Go to Send to deliver it.</p>
          <Button asChild>
            <Link href={campaignPhasePath(campaignId, "send")}>Go to Send</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Recipients</p>
            <p className="text-lg font-semibold">{recipientCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Delivered</p>
            <p className="text-lg font-semibold text-success">{summarizeSendLogs(sendLogs).sent}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-lg font-semibold text-destructive">{summarizeSendLogs(sendLogs).failed}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="text-lg font-semibold">{Math.max(0, recipientCount - summarizeSendLogs(sendLogs).sent)}</p>
          </div>
        </CardContent>
      </Card>

      {failedCount > 0 && diagnostics.length > 0 && (
        <Card className="border-destructive/30">
          <CardContent className="p-5">
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
                <Wrench className="size-4 text-destructive" />
                <span className="font-medium text-foreground">
                  Troubleshooting — {failedCount} failed email{failedCount !== 1 ? "s" : ""}
                </span>
                <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 grid gap-3">
                  {diagnostics.map((diagnostic) => (
                    <div
                      key={diagnostic.category}
                      className={`rounded-md border p-3 ${
                        diagnostic.severity === "error"
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-warning/30 bg-warning/5"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        {diagnostic.severity === "error" ? (
                          <XCircle className="size-4 text-destructive" />
                        ) : (
                          <AlertTriangle className="size-4 text-warning" />
                        )}
                        <span className="text-sm font-medium text-foreground">{diagnostic.category}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {diagnostic.count} email{diagnostic.count !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <p className="ml-6 text-xs text-muted-foreground">{diagnostic.suggestion}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Send Log ({filteredLogs.length} of {sendLogs.length})
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search logs"
                value={logQuery}
                onChange={(e) => setLogQuery(e.target.value)}
                className="h-8 w-44"
              />
              <Select value={logFilter} onValueChange={(value) => setLogFilter(value as "all" | "sent" | "failed")}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExportLogs} disabled={filteredLogs.length === 0}>
                <Download className="mr-2 size-4" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadFailedErrors}
                disabled={failedLogs.length === 0}
              >
                <FileJson className="mr-2 size-4" />
                Download errors
              </Button>
            </div>
          </div>
          {filteredLogs.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No send log rows match the current search and filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-[88px]">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.contactEmail}</TableCell>
                    <TableCell className="text-sm">{log.contactName}</TableCell>
                    <TableCell>
                      {log.status === "sent" ? (
                        <Badge className="bg-success text-xs text-success-foreground">
                          <CheckCircle2 className="mr-1 size-3" />
                          Sent
                        </Badge>
                      ) : log.status === "failed" ? (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="mr-1 size-3" />
                          Failed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="mr-1 size-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                      {log.error || log.errorDetail ? (
                        <button
                          type="button"
                          className="block w-full truncate text-left hover:text-foreground hover:underline"
                          onClick={() => setErrorDialogLog(log)}
                        >
                          {log.error || "View error details"}
                        </button>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.sentAt ? new Date(log.sentAt).toLocaleTimeString() : "-"}
                    </TableCell>
                    <TableCell>
                      {(log.error || log.errorDetail) && (
                        <TooltipProvider>
                          <div className="flex items-center justify-end">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`View full error for ${log.contactEmail}`}
                                  onClick={() => setErrorDialogLog(log)}
                                >
                                  <Eye className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View full error</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Download error for ${log.contactEmail}`}
                                  onClick={() => handleDownloadError(log)}
                                >
                                  <Download className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download full error</TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filteredLogs.length > LOG_PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {logPage} of {Math.ceil(filteredLogs.length / LOG_PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage === 1}
                  onClick={() => setLogPageState({ key: pageKey, page: Math.max(1, logPage - 1) })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage >= Math.ceil(filteredLogs.length / LOG_PAGE_SIZE)}
                  onClick={() => setLogPageState({ key: pageKey, page: logPage + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={errorDialogLog != null} onOpenChange={(open) => !open && setErrorDialogLog(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Full send error</DialogTitle>
            <DialogDescription>
              {errorDialogLog
                ? `Complete error log for ${errorDialogLog.contactEmail}`
                : "Complete error log for analysis"}
            </DialogDescription>
          </DialogHeader>
          {errorDialogLog && !errorDialogLog.errorDetail?.trim() && (
            <p className="shrink-0 text-xs text-muted-foreground">
              Only the short error was stored for this send. Retry the failed recipients to capture the full API
              or SMTP payload.
            </p>
          )}
          {errorDialogLog && listValidationIssues(errorDialogLog.errorDetail).length > 0 && (
            <div className="shrink-0 rounded-md border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-foreground">Validation issues</p>
              <ul className="grid gap-1.5 text-xs text-muted-foreground">
                {listValidationIssues(errorDialogLog.errorDetail).map((issue, index) => (
                  <li key={`${issue.path}:${index}`} className="break-words font-mono">
                    {issue.path ? `${issue.path}: ${issue.message}` : issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40">
            <pre className="p-3 font-mono text-xs break-words whitespace-pre-wrap select-text">
              {errorDialogLog ? serializeSendLogError(errorDialogLog) : ""}
            </pre>
          </div>
          <DialogFooter className="shrink-0 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => errorDialogLog && void handleCopyError(errorDialogLog)}
              disabled={!errorDialogLog}
            >
              <Copy className="mr-2 size-4" />
              Copy
            </Button>
            <Button
              variant="outline"
              onClick={() => errorDialogLog && handleDownloadError(errorDialogLog)}
              disabled={!errorDialogLog}
            >
              <Download className="mr-2 size-4" />
              Download JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
