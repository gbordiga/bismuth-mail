"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { db, type Newsletter, type Sender, type EmailList, type Contact, type SmtpConfig, type SendLog } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Send,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { type EditorBlock, buildFullHtml } from "@/lib/email-builder"

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
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

  const abortRef = useRef(false)

  const load = useCallback(async () => {
    const [allNl, allSenders, allSmtp, allLists] = await Promise.all([
      db.newsletters.orderBy("createdAt").reverse().toArray(),
      db.senders.toArray(),
      db.smtpConfigs.toArray(),
      db.emailLists.toArray(),
    ])
    // Recover newsletters stuck in "sending" (e.g. browser closed mid-send)
    for (const nl of allNl) {
      if (nl.status === "sending") {
        await db.newsletters.update(nl.id!, { status: "draft" })
        nl.status = "draft"
      }
    }
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
    const mailtoHref = `mailto:${unsubEmail}?subject=${encodeURIComponent("UNSUBSCRIBE")}&body=${encodeURIComponent("Please remove john@example.com from this newsletter.")}`
    const html = buildFullHtml(blocks, sender?.signature || "", mailtoHref, true)

    // Replace with sample data
    const sample = html
      .replace(/\{\{email\}\}/g, "john@example.com")
      .replace(/\{\{firstName\}\}/g, "John")
      .replace(/\{\{lastName\}\}/g, "Doe")
    setPreviewHtml(sample)
    setPreviewOpen(true)
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
      toast.error("No sender or SMTP config found for this newsletter")
      setSending(false)
      return
    }

    let blocks: EditorBlock[]
    try {
      blocks = JSON.parse(selectedNl.htmlContent)
    } catch {
      blocks = [{ id: "raw", type: "html", content: selectedNl.htmlContent, props: {} }]
    }

    // Gather all contacts (deduplicate by email using Set)
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

    await db.newsletters.update(selectedNl.id!, { status: "sending" })
    setSendProgress({ total: allContacts.length, sent: 0, failed: 0 })

    // Clear old logs
    await db.sendLogs.where("newsletterId").equals(selectedNl.id!).delete()

    let sentCount = 0
    let failedCount = 0

    const unsubEmail = sender.unsubscribeEmail || sender.email

    for (const contact of allContacts) {
      if (abortRef.current) break

      const mailtoHref = `mailto:${unsubEmail}?subject=${encodeURIComponent("UNSUBSCRIBE")}&body=${encodeURIComponent(`Please remove ${contact.email} from this newsletter.`)}`
      const fullHtml = buildFullHtml(blocks, sender.signature, mailtoHref)
      const personalizedHtml = replaceMergeFields(fullHtml, contact)
      const personalizedSubject = replaceMergeFields(selectedNl.subject, contact)

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
            to: contact.email,
            subject: personalizedSubject,
            html: personalizedHtml,
          }),
        })

        const data = await res.json()
        if (data.success) {
          sentCount++
          await db.sendLogs.add({
            newsletterId: selectedNl.id!,
            contactEmail: contact.email,
            contactName: `${contact.firstName} ${contact.lastName}`.trim(),
            status: "sent",
            sentAt: new Date(),
          })
        } else {
          failedCount++
          await db.sendLogs.add({
            newsletterId: selectedNl.id!,
            contactEmail: contact.email,
            contactName: `${contact.firstName} ${contact.lastName}`.trim(),
            status: "failed",
            error: data.error,
            sentAt: new Date(),
          })
        }
      } catch (err) {
        failedCount++
        await db.sendLogs.add({
          newsletterId: selectedNl.id!,
          contactEmail: contact.email,
          contactName: `${contact.firstName} ${contact.lastName}`.trim(),
          status: "failed",
          error: String(err),
          sentAt: new Date(),
        })
      }

      setSendProgress({ total: allContacts.length, sent: sentCount, failed: failedCount })
    }

    if (abortRef.current) {
      await db.newsletters.update(selectedNl.id!, { status: "draft" })
      setSending(false)
      toast.info(`Campaign aborted. ${sentCount} delivered, ${failedCount} failed, ${allContacts.length - sentCount - failedCount} skipped.`)
    } else {
      await db.newsletters.update(selectedNl.id!, { status: "sent", sentAt: new Date() })
      setSending(false)
      toast.success(`Campaign sent! ${sentCount} delivered, ${failedCount} failed.`)
    }
    load()
  }

  function abortSend() {
    abortRef.current = true
    toast.info("Aborting... will stop after current email.")
  }

  const draftNewsletters = newsletters.filter((n) => n.status === "draft")
  const progressPct = sendProgress.total > 0 ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100 : 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Send Campaign</h2>
        <p className="text-sm text-muted-foreground">
          Select a newsletter and send it to your subscribers
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Select Newsletter</Label>
              <Select
                value={selectedNlId ? String(selectedNlId) : ""}
                onValueChange={(v) => setSelectedNlId(parseInt(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a newsletter..." />
                </SelectTrigger>
                <SelectContent>
                  {newsletters.map((nl) => (
                    <SelectItem key={nl.id} value={String(nl.id)}>
                      <div className="flex items-center gap-2">
                        <span>{nl.name}</span>
                        <Badge variant={nl.status === "draft" ? "secondary" : nl.status === "sent" ? "default" : "outline"} className="text-xs">
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
              <strong>{recipientCount} recipients</strong> across {selectedNl?.listIds.length} list(s).
              This action cannot be undone.
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
            <iframe
              srcDoc={previewHtml}
              className="size-full"
              title="Email preview"
              sandbox="allow-same-origin"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
