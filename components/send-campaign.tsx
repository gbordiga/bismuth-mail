"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { db, type Newsletter, type Sender, type EmailList, type Contact, type SmtpConfig, type SendLog } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
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
import { Send, Eye, AlertTriangle, CheckCircle2, XCircle, Clock, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"

import { type EditorBlock, buildFullHtml } from "@/lib/email-builder"

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function replaceMergeFields(html: string, contact: Contact): string {
  let result = html
  result = result.replace(/\{\{email\}\}/g, escapeHtml(contact.email))
  result = result.replace(/\{\{firstName\}\}/g, escapeHtml(contact.firstName))
  result = result.replace(/\{\{lastName\}\}/g, escapeHtml(contact.lastName))
  if (contact.customData) {
    for (const [key, value] of Object.entries(contact.customData)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), escapeHtml(value || ""))
    }
  }
  return result
}

export function SendCampaignSection() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [senders, setSenders] = useState<Sender[]>([])
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([])
  const [lists, setLists] = useState<EmailList[]>([])
  const [selectedNlId, setSelectedNlId] = useState<number | null>(null)
  const [sendLogs, setSendLogs] = useState<SendLog[]>([])

  // Send state
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ total: 0, sent: 0, failed: 0 })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [recipientCount, setRecipientCount] = useState(0)
  const [testEmailOpen, setTestEmailOpen] = useState(false)
  const [testEmailAddress, setTestEmailAddress] = useState("")
  const [sendingTest, setSendingTest] = useState(false)

  const abortRef = useRef(false)

  const load = useCallback(async () => {
    const [allNl, allSenders, allSmtp, allLists] = await Promise.all([
      db.newsletters.orderBy("createdAt").reverse().toArray(),
      db.senders.toArray(),
      db.smtpConfigs.toArray(),
      db.emailLists.toArray(),
    ])
    setNewsletters(allNl)
    setSenders(allSenders)
    setSmtpConfigs(allSmtp)
    setLists(allLists)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Load send logs for selected newsletter
  useEffect(() => {
    if (selectedNlId) {
      db.sendLogs.where("newsletterId").equals(selectedNlId).toArray().then(setSendLogs)
    } else {
      setSendLogs([])
    }
  }, [selectedNlId, sendProgress])

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

    // Replace with sample data
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
        toast.error(`Failed to send test email: ${data.error}`)
      }
    } catch (err) {
      toast.error(`Failed to send test email: ${String(err)}`)
    } finally {
      setSendingTest(false)
    }
  }

  async function prepareConfirm() {
    if (!selectedNl) return
    const seen = new Set<string>()
    for (const lid of selectedNl.listIds) {
      const contactsInList = await db.contacts
        .where("listId")
        .equals(lid)
        .filter((c) => !c.unsubscribed)
        .toArray()
      for (const c of contactsInList) {
        seen.add(c.email)
      }
    }
    setRecipientCount(seen.size)
    setConfirmOpen(true)
  }

  async function handleSend() {
    if (!selectedNl) return
    setConfirmOpen(false)
    setSending(true)
    abortRef.current = false

    const sender = senders.find((s) => s.id === selectedNl.senderId)
    const smtpConfig = sender ? smtpConfigs.find((c) => c.id === sender.smtpConfigId) : null

    if (!sender || !smtpConfig) {
      toast.error("No sender or SMTP config found for this campaign")
      setSending(false)
      return
    }

    let blocks: EditorBlock[]
    try {
      blocks = JSON.parse(selectedNl.htmlContent)
    } catch {
      blocks = [{ id: "raw", type: "html", content: selectedNl.htmlContent, props: {} }]
    }

    // Gather all contacts (deduplicate by email)
    const allContacts: Contact[] = []
    const seenEmails = new Set<string>()
    for (const lid of selectedNl.listIds) {
      const contactsInList = await db.contacts
        .where("listId")
        .equals(lid)
        .filter((c) => !c.unsubscribed)
        .toArray()
      for (const c of contactsInList) {
        if (!seenEmails.has(c.email)) {
          seenEmails.add(c.email)
          allContacts.push(c)
        }
      }
    }

    if (allContacts.length === 0) {
      toast.error("No active recipients found in the selected lists")
      setSending(false)
      return
    }

    // Resume: load existing logs and skip already-sent emails
    const existingLogs = await db.sendLogs
      .where("newsletterId")
      .equals(selectedNl.id!)
      .toArray()
    const alreadySent = new Set(
      existingLogs.filter((l) => l.status === "sent").map((l) => l.contactEmail),
    )
    const toSend = allContacts.filter((c) => !alreadySent.has(c.email))

    await db.newsletters.update(selectedNl.id!, { status: "sending" })

    let sentCount = alreadySent.size
    let failedCount = existingLogs.filter((l) => l.status === "failed").length
    setSendProgress({ total: allContacts.length, sent: sentCount, failed: failedCount })

    if (toSend.length === 0) {
      await db.newsletters.update(selectedNl.id!, { status: "sent", sentAt: new Date() })
      setSending(false)
      toast.success("All emails were already sent.")
      load()
      return
    }

    const batchSize = smtpConfig.batchSize ?? 10
    const delayMs = smtpConfig.delayMs ?? 200
    const unsubEmail = sender.unsubscribeEmail || sender.email

    for (let i = 0; i < toSend.length; i += batchSize) {
      if (abortRef.current) break

      const batch = toSend.slice(i, i + batchSize)
      const recipients = batch.map((contact) => {
        const mailtoHref = `mailto:${unsubEmail}?subject=${encodeURIComponent("UNSUBSCRIBE")}&body=${encodeURIComponent(`Please remove ${contact.email} from this mailing list.`)}`
        const fullHtml = buildFullHtml(blocks, sender.signature, mailtoHref)
        return {
          to: contact.email,
          subject: replaceMergeFields(selectedNl.subject, contact),
          html: replaceMergeFields(fullHtml, contact),
        }
      })

      try {
        const res = await fetch("/api/smtp/send-batch", {
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
            recipients,
            delayMs,
            maxRetries: 2,
          }),
        })

        const data = await res.json()
        if (data.results) {
          for (const r of data.results as { email: string; status: "sent" | "failed"; attempts: number; error?: string }[]) {
            const contact = batch.find((c) => c.email === r.email)
            const contactName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : r.email
            if (r.status === "sent") {
              sentCount++
            } else {
              failedCount++
            }
            await db.sendLogs.add({
              newsletterId: selectedNl.id!,
              contactEmail: r.email,
              contactName,
              status: r.status,
              attempt: r.attempts,
              error: r.error,
              sentAt: new Date(),
            })
          }
        } else {
          for (const contact of batch) {
            failedCount++
            await db.sendLogs.add({
              newsletterId: selectedNl.id!,
              contactEmail: contact.email,
              contactName: `${contact.firstName} ${contact.lastName}`.trim(),
              status: "failed",
              attempt: 1,
              error: data.error || "Batch request failed",
              sentAt: new Date(),
            })
          }
        }
      } catch (err) {
        for (const contact of batch) {
          failedCount++
          await db.sendLogs.add({
            newsletterId: selectedNl.id!,
            contactEmail: contact.email,
            contactName: `${contact.firstName} ${contact.lastName}`.trim(),
            status: "failed",
            attempt: 1,
            error: String(err),
            sentAt: new Date(),
          })
        }
      }

      setSendProgress({ total: allContacts.length, sent: sentCount, failed: failedCount })

      if (i + batchSize < toSend.length && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    if (abortRef.current) {
      await db.newsletters.update(selectedNl.id!, { status: "sending" })
      setSending(false)
      toast.info(
        `Campaign paused. ${sentCount} delivered, ${failedCount} failed, ${allContacts.length - sentCount - failedCount} remaining. You can resume later.`,
      )
    } else {
      await db.newsletters.update(selectedNl.id!, { status: "sent", sentAt: new Date() })
      setSending(false)
      toast.success(`Campaign sent! ${sentCount} delivered, ${failedCount} failed.`)
    }
    load()
  }

  async function handleResetToDraft() {
    if (!selectedNl) return
    await db.sendLogs.where("newsletterId").equals(selectedNl.id!).delete()
    await db.newsletters.update(selectedNl.id!, { status: "draft" })
    toast.info("Campaign reset to draft. All send logs cleared.")
    load()
  }

  function abortSend() {
    abortRef.current = true
    toast.info("Aborting... will stop after current batch.")
  }

  const draftNewsletters = newsletters.filter((n) => n.status === "draft")
  const progressPct =
    sendProgress.total > 0 ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100 : 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Send Campaign</h2>
        <p className="text-sm text-muted-foreground">Select a campaign and send it to your subscribers</p>
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
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedNl && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subject:</span>
                    <span className="font-medium text-foreground">{selectedNl.subject}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sender:</span>
                    <span className="text-foreground">
                      {senders.find((s) => s.id === selectedNl.senderId)?.name || "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Target Lists:</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedNl.listIds.map((lid) => (
                        <Badge key={lid} variant="outline" className="text-xs">
                          {lists.find((l) => l.id === lid)?.name || "Unknown"}
                        </Badge>
                      ))}
                      {selectedNl.listIds.length === 0 && (
                        <span className="text-muted-foreground">No lists selected</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge
                      variant={selectedNl.status === "draft" ? "secondary" : "default"}
                      className={selectedNl.status === "sent" ? "bg-success text-success-foreground" : ""}
                    >
                      {selectedNl.status}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
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
                  {selectedNl.status === "sending" && !sending && (
                    <>
                      <Button
                        size="sm"
                        onClick={handleSend}
                        disabled={selectedNl.listIds.length === 0 || !selectedNl.senderId}
                      >
                        <Send className="mr-2 size-4" />
                        Resume Send
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleResetToDraft}
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
      {sending && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="font-medium text-foreground">Sending in progress...</span>
              <Button variant="destructive" size="sm" className="ml-auto" onClick={abortSend}>
                Abort
              </Button>
            </div>
            <Progress value={progressPct} className="mb-2" />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
            </div>
          </CardContent>
        </Card>
      )}

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
            <Button onClick={handleSend}>
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
