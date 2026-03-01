"use client"

import { useState, useEffect, useCallback } from "react"
import { db, type Newsletter, type Sender, type EmailList, type SmtpConfig, type SendLog } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Send, Eye, AlertTriangle, CheckCircle2, XCircle, Clock, Loader2, Mail, ChevronDown, Zap, Wrench } from "lucide-react"
import { toast } from "sonner"
import { useSending } from "@/lib/sending-context"
import {
  countUniqueActiveRecipients,
  loadSendCampaignData,
  loadSendLogsByNewsletter,
} from "@/lib/repositories/campaign-repository"

import { type EditorBlock, buildFullHtml } from "@/lib/email-builder"

interface ErrorDiagnostic {
  category: string
  count: number
  suggestion: string
  severity: "warning" | "error"
}

function diagnoseErrors(logs: SendLog[]): ErrorDiagnostic[] {
  const failed = logs.filter((l) => l.status === "failed" && l.error)
  if (failed.length === 0) return []

  const categories: Record<string, { count: number; suggestion: string; severity: "warning" | "error" }> = {}

  for (const log of failed) {
    const err = (log.error || "").toLowerCase()

    if (/auth|535|534|login|credential/i.test(err)) {
      const key = "Authentication failed"
      categories[key] = categories[key] || { count: 0, suggestion: "Check your SMTP username and password. If using Gmail/Outlook, you need an App Password (not your account password).", severity: "error" }
      categories[key].count++
    } else if (/421|450|too many|rate|throttl/i.test(err)) {
      const key = "Rate limited by server"
      categories[key] = categories[key] || { count: 0, suggestion: "Your SMTP server is throttling sends. Increase the 'Delay' setting (try 100-500ms) and reduce 'Connections' (try 2-3).", severity: "warning" }
      categories[key].count++
    } else if (/econnection|econnrefused|econnreset|etimedout|timeout/i.test(err)) {
      const key = "Connection error"
      categories[key] = categories[key] || { count: 0, suggestion: "Cannot connect to the SMTP server. Verify host and port are correct, and check your firewall or network. Try testing the connection first.", severity: "error" }
      categories[key].count++
    } else if (/certificate|tls|starttls|ssl/i.test(err)) {
      const key = "TLS/SSL error"
      categories[key] = categories[key] || { count: 0, suggestion: "TLS handshake failed. Try toggling the TLS setting in your SMTP config, or switch between ports 587 (STARTTLS) and 465 (TLS).", severity: "error" }
      categories[key].count++
    } else if (/550|553|mailbox|user unknown|recipient|does not exist/i.test(err)) {
      const key = "Invalid recipient"
      categories[key] = categories[key] || { count: 0, suggestion: "Some email addresses are invalid or the recipient's mailbox doesn't exist. Remove these contacts from your list.", severity: "warning" }
      categories[key].count++
    } else if (/452|quota|storage|disk/i.test(err)) {
      const key = "Server quota exceeded"
      categories[key] = categories[key] || { count: 0, suggestion: "Your SMTP server's sending quota is full. Wait and try again later, or contact your email provider to increase limits.", severity: "error" }
      categories[key].count++
    } else if (/epipe|esocket|socket/i.test(err)) {
      const key = "Connection dropped"
      categories[key] = categories[key] || { count: 0, suggestion: "The connection was dropped mid-send. This is usually transient — the retry mechanism should handle it. If persistent, reduce 'Connections' to 2-3.", severity: "warning" }
      categories[key].count++
    } else {
      const key = "Other error"
      categories[key] = categories[key] || { count: 0, suggestion: "Check the error details in the send log below for more information.", severity: "warning" }
      categories[key].count++
    }
  }

  return Object.entries(categories)
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.count - a.count)
}

export function SendCampaignSection() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [senders, setSenders] = useState<Sender[]>([])
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([])
  const [lists, setLists] = useState<EmailList[]>([])
  const [selectedNlId, setSelectedNlId] = useState<number | null>(null)
  const [sendLogs, setSendLogs] = useState<SendLog[]>([])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [recipientCount, setRecipientCount] = useState(0)
  const [testEmailOpen, setTestEmailOpen] = useState(false)
  const [testEmailAddress, setTestEmailAddress] = useState("")
  const [sendingTest, setSendingTest] = useState(false)

  const { sending, phase, activeNewsletterId, sendProgress, sendSpeed, startSend, abortSend } = useSending()

  const isThisCampaignSending = sending && activeNewsletterId === selectedNlId

  const load = useCallback(async () => {
    const data = await loadSendCampaignData()
    setNewsletters(data.newsletters)
    setSenders(data.senders)
    setSmtpConfigs(data.smtpConfigs)
    setLists(data.lists)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Reload data when sending finishes
  useEffect(() => {
    if (!sending) {
      load()
    }
  }, [sending, load])

  // Load send logs for selected newsletter, refresh as progress updates
  useEffect(() => {
    if (selectedNlId) {
      loadSendLogsByNewsletter(selectedNlId).then(setSendLogs)
    } else {
      setSendLogs([])
    }
  }, [selectedNlId, sendProgress])

  // Auto-select the campaign being sent when mounting
  useEffect(() => {
    if (sending && activeNewsletterId && !selectedNlId) {
      setSelectedNlId(activeNewsletterId)
    }
  }, [sending, activeNewsletterId, selectedNlId])

  const selectedNl = newsletters.find((n) => n.id === selectedNlId)

  async function showPreview() {
    if (!selectedNl) return
    const sender = senders.find((s) => s.id === selectedNl.senderId)
    let blocks: EditorBlock[]
    try {
      blocks = JSON.parse(selectedNl.htmlContent)
    } catch {
      blocks = [{ id: "raw", type: "html", content: selectedNl.htmlContent, props: {} }]
    }
    const unsubEmail = sender?.unsubscribeEmail || sender?.email || "unsubscribe@example.com"
    const mailtoHref = `mailto:${unsubEmail}?subject=${encodeURIComponent("UNSUBSCRIBE")}&body=${encodeURIComponent("Please remove john@example.com from this mailing list.")}`
    const html = buildFullHtml(blocks, sender?.signature || "", mailtoHref, true)

    const sample = html
      .replace(/\{\{email\}\}/g, "john@example.com")
      .replace(/\{\{firstName\}\}/g, "John")
      .replace(/\{\{lastName\}\}/g, "Doe")
    setPreviewHtml(sample)
    setPreviewOpen(true)
  }

  async function handleSendTest() {
    if (!selectedNl || !testEmailAddress.trim()) return
    setSendingTest(true)

    const sender = senders.find((s) => s.id === selectedNl.senderId)
    const smtpConfig = sender ? smtpConfigs.find((c) => c.id === sender.smtpConfigId) : null

    if (!sender || !smtpConfig) {
      toast.error("No sender or SMTP config found for this campaign")
      setSendingTest(false)
      return
    }

    let blocks: EditorBlock[]
    try {
      blocks = JSON.parse(selectedNl.htmlContent)
    } catch {
      blocks = [{ id: "raw", type: "html", content: selectedNl.htmlContent, props: {} }]
    }

    const unsubEmail = sender.unsubscribeEmail || sender.email
    const mailtoHref = `mailto:${unsubEmail}?subject=${encodeURIComponent("UNSUBSCRIBE")}&body=${encodeURIComponent(`Please remove ${testEmailAddress.trim()} from this mailing list.`)}`
    const fullHtml = buildFullHtml(blocks, sender.signature, mailtoHref)
    const html = fullHtml
      .replace(/\{\{email\}\}/g, testEmailAddress.trim())
      .replace(/\{\{firstName\}\}/g, "John")
      .replace(/\{\{lastName\}\}/g, "Doe")

    try {
      const res = await fetch("/api/smtp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp: {
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure,
            auth: { user: smtpConfig.username, pass: smtpConfig.password },
          },
          from: { name: sender.name, email: sender.email },
          replyTo: sender.replyTo || sender.email,
          to: testEmailAddress.trim(),
          subject: `[TEST] ${selectedNl.subject}`,
          html,
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(`Test email sent to ${testEmailAddress.trim()}`)
        setTestEmailOpen(false)
      } else {
        toast.error(`Failed to send test email: ${data.message ?? data.error ?? "Unknown SMTP error"}`)
      }
    } catch (err) {
      toast.error(`Failed to send test email: ${String(err)}`)
    } finally {
      setSendingTest(false)
    }
  }

  async function prepareConfirm() {
    if (!selectedNl) return
    const uniqueRecipients = await countUniqueActiveRecipients(selectedNl.listIds)
    setRecipientCount(uniqueRecipients)
    setConfirmOpen(true)
  }

  async function handleConfirmSend() {
    if (!selectedNl?.id) return
    setConfirmOpen(false)
    startSend(selectedNl.id)
  }

  async function handleResetToDraft() {
    if (!selectedNl) return
    await db.sendLogs.where("newsletterId").equals(selectedNl.id!).delete()
    await db.newsletters.update(selectedNl.id!, { status: "draft" })
    toast.info("Campaign reset to draft. All send logs cleared.")
    load()
  }

  const progressPct =
    sendProgress.total > 0 ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100 : 0

  return (
    <div className="content-area">
      <div className="section-header">
        <div>
          <h2 className="section-title">Send Campaign</h2>
          <p className="section-description">Select a campaign and send it to your subscribers</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Select Campaign</Label>
              <Select
                value={selectedNlId ? String(selectedNlId) : ""}
                onValueChange={(v) => setSelectedNlId(parseInt(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a campaign..." />
                </SelectTrigger>
                <SelectContent>
                  {newsletters.map((nl) => (
                    <SelectItem key={nl.id} value={String(nl.id)}>
                      <div className="flex items-center gap-2">
                        <span>{nl.name}</span>
                        <Badge
                          variant={nl.status === "draft" ? "secondary" : nl.status === "sent" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {nl.status}
                        </Badge>
                        {sending && activeNewsletterId === nl.id && (
                          <Loader2 className="size-3 animate-spin text-primary" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!selectedNl && (
              <div className="empty-state py-10">
                <div className="empty-state-icon">
                  <Send className="size-7" />
                </div>
                <p className="empty-state-title">
                  {newsletters.length === 0 ? "No campaigns available" : "Select a campaign to continue"}
                </p>
                <p className="empty-state-description">
                  {newsletters.length === 0
                    ? "Create a campaign in the Campaigns section, then come back here to send it."
                    : "Pick a campaign from the dropdown to preview settings, run tests, and send."}
                </p>
              </div>
            )}

            {selectedNl && (
              <div className="status-panel p-5">
                <div className="grid gap-4 text-sm md:grid-cols-[140px_1fr]">
                  <span className="text-muted-foreground">Subject</span>
                  <span className="font-medium text-foreground">{selectedNl.subject}</span>

                  <span className="text-muted-foreground">Sender</span>
                  <span className="text-foreground">
                    {senders.find((s) => s.id === selectedNl.senderId)?.name || "Not set"}
                  </span>

                  <span className="text-muted-foreground">Target Lists</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedNl.listIds.map((lid) => (
                      <Badge key={lid} variant="outline" className="text-xs">
                        {lists.find((l) => l.id === lid)?.name || "Unknown"}
                      </Badge>
                    ))}
                    {selectedNl.listIds.length === 0 && <span className="text-muted-foreground">No lists selected</span>}
                  </div>

                  <span className="text-muted-foreground">Status</span>
                  <div>
                    <Badge
                      variant={selectedNl.status === "draft" ? "secondary" : "default"}
                      className={selectedNl.status === "sent" ? "bg-success text-success-foreground" : ""}
                    >
                      {selectedNl.status}
                    </Badge>
                  </div>
                </div>
                <div className="action-cluster mt-4">
                  <Button variant="outline" size="sm" onClick={showPreview}>
                    <Eye className="mr-2 size-4" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTestEmailOpen(true)}
                    disabled={!selectedNl.senderId}
                  >
                    <Mail className="mr-2 size-4" />
                    Send Test
                  </Button>
                  {selectedNl.status === "draft" && (
                    <Button
                      size="sm"
                      onClick={prepareConfirm}
                      disabled={sending || selectedNl.listIds.length === 0 || !selectedNl.senderId}
                    >
                      <Send className="mr-2 size-4" />
                      Send Now
                    </Button>
                  )}
                  {selectedNl.status === "sending" && !isThisCampaignSending && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => selectedNl.id && startSend(selectedNl.id)}
                        disabled={sending || selectedNl.listIds.length === 0 || !selectedNl.senderId}
                      >
                        <Send className="mr-2 size-4" />
                        Resume Send
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleResetToDraft}
                        disabled={sending}
                      >
                        Reset to Draft
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Send progress */}
      {isThisCampaignSending && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="font-medium text-foreground">
                {phase === "preparing" && "Preparing campaign..."}
                {phase === "checking-smtp" && "Verifying SMTP connection..."}
                {phase === "sending" && "Sending in progress..."}
                {phase === "finishing" && "Finishing up..."}
              </span>
              <Button variant="destructive" size="sm" className="ml-auto" onClick={abortSend}>
                Abort
              </Button>
            </div>
            {phase === "checking-smtp" && (
              <p className="text-xs text-muted-foreground mb-2">
                Testing connection to your SMTP server before sending...
              </p>
            )}
            {(phase === "sending" || phase === "finishing") && (
              <>
                <Progress value={progressPct} className="mb-2" />
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span>Total: {sendProgress.total}</span>
                  <span className="text-success flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    Sent: {sendProgress.sent}
                  </span>
                  <span className="text-destructive flex items-center gap-1">
                    <XCircle className="size-3" />
                    Failed: {sendProgress.failed}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    Remaining: {sendProgress.total - sendProgress.sent - sendProgress.failed}
                  </span>
                  {sendSpeed.perSecond > 0 && (
                    <>
                      <span className="flex items-center gap-1 text-primary">
                        <Zap className="size-3" />
                        {sendSpeed.perSecond.toFixed(1)} emails/s
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        ETA: {sendSpeed.etaSeconds < 60 ? `${Math.ceil(sendSpeed.etaSeconds)}s` : `${Math.floor(sendSpeed.etaSeconds / 60)}m ${Math.ceil(sendSpeed.etaSeconds % 60)}s`}
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Other campaign sending indicator */}
      {sending && activeNewsletterId !== selectedNlId && (
        <Card className="border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Another campaign is currently being sent ({sendProgress.sent}/{sendProgress.total})
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Troubleshooting */}
      {sendLogs.filter((l) => l.status === "failed").length > 0 && (() => {
        const diagnostics = diagnoseErrors(sendLogs)
        if (diagnostics.length === 0) return null
        return (
          <Card className="border-destructive/30">
            <CardContent className="p-5">
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
                  <Wrench className="size-4 text-destructive" />
                  <span className="font-medium text-foreground">
                    Troubleshooting — {sendLogs.filter((l) => l.status === "failed").length} failed email{sendLogs.filter((l) => l.status === "failed").length !== 1 ? "s" : ""}
                  </span>
                  <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 grid gap-3">
                    {diagnostics.map((d) => (
                      <div key={d.category} className={`rounded-md border p-3 ${d.severity === "error" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {d.severity === "error" ? (
                            <XCircle className="size-4 text-destructive" />
                          ) : (
                            <AlertTriangle className="size-4 text-warning" />
                          )}
                          <span className="text-sm font-medium text-foreground">{d.category}</span>
                          <Badge variant="secondary" className="ml-auto text-xs">{d.count} email{d.count !== 1 ? "s" : ""}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground ml-6">{d.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        )
      })()}

      {/* Send Logs */}
      {sendLogs.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-5 py-3">
              <h3 className="text-sm font-medium text-foreground">Send Log ({sendLogs.length} entries)</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sendLogs.slice(0, 100).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.contactEmail}</TableCell>
                    <TableCell className="text-sm">{log.contactName}</TableCell>
                    <TableCell>
                      {log.status === "sent" ? (
                        <Badge className="bg-success text-success-foreground text-xs">
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
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {log.error || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.sentAt ? new Date(log.sentAt).toLocaleTimeString() : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Confirm send dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              Confirm Send
            </DialogTitle>
            <DialogDescription>
              You are about to send <strong>{selectedNl?.subject}</strong> to{" "}
              <strong>{recipientCount} recipients</strong> across {selectedNl?.listIds.length} list(s). This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSend}>
              <Send className="mr-2 size-4" />
              Confirm Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto rounded border bg-muted/30" style={{ height: "60vh" }}>
            <iframe srcDoc={previewHtml} className="size-full" title="Email preview" sandbox="allow-same-origin" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Send test email dialog */}
      <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-5" />
              Send Test Email
            </DialogTitle>
            <DialogDescription>
              Send a test copy of <strong>{selectedNl?.name}</strong> to any email address. Merge fields will be
              replaced with sample data.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="test-email-address">Recipient Email</Label>
            <Input
              id="test-email-address"
              type="email"
              placeholder="test@example.com"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && testEmailAddress.trim() && !sendingTest) {
                  handleSendTest()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestEmailOpen(false)} disabled={sendingTest}>
              Cancel
            </Button>
            <Button onClick={handleSendTest} disabled={sendingTest || !testEmailAddress.trim()}>
              {sendingTest ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              {sendingTest ? "Sending..." : "Send Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
