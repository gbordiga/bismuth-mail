"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Mail,
  Paperclip,
  RotateCcw,
  Send,
  XCircle,
  Zap,
} from "lucide-react"
import { CampaignStatusBadge } from "@/components/campaign-status-badge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { collectMailAttachments, listCampaignAttachments } from "@/lib/attachments"
import { db, type Contact, type EmailList, type Newsletter, type Sender, type SmtpConfig } from "@/lib/db"
import { isValidEmail } from "@/lib/email"
import { buildFullHtml } from "@/lib/email-builder"
import { replaceMergeFields } from "@/lib/merge-fields"
import { campaignPhasePath, isSendReady } from "@/lib/operator"
import { buildCampaignPreviewHtml, buildCampaignPreviewSubject, buildUnsubscribeMailto, parseCampaignBlocks } from "@/lib/preview"
import {
  countUniqueActiveRecipients,
  getUniqueActiveContacts,
  loadSendLogsByNewsletter,
} from "@/lib/repositories/campaign-repository"
import { summarizeSendLogs } from "@/lib/send-engine"
import { useSending } from "@/lib/sending-context"
import { toast } from "sonner"

export function CampaignSend({ campaignId }: { campaignId: number }) {
  const router = useRouter()
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [senders, setSenders] = useState<Sender[]>([])
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([])
  const [lists, setLists] = useState<EmailList[]>([])
  const [sendLogs, setSendLogs] = useState<Awaited<ReturnType<typeof loadSendLogsByNewsletter>>>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [previewContacts, setPreviewContacts] = useState<Contact[]>([])
  const [previewContactEmail, setPreviewContactEmail] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [recipientCount, setRecipientCount] = useState(0)
  const [testEmailOpen, setTestEmailOpen] = useState(false)
  const [testEmailAddress, setTestEmailAddress] = useState("")
  const [sendingTest, setSendingTest] = useState(false)
  const [previewSubject, setPreviewSubject] = useState("")
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { sending, phase, activeNewsletterId, sendProgress, sendSpeed, startSend, abortSend } = useSending()
  const isThisCampaignSending = sending && activeNewsletterId === campaignId

  const load = useCallback(async () => {
    const [campaign, nextSenders, nextSmtp, nextLists] = await Promise.all([
      db.newsletters.get(campaignId),
      db.senders.toArray(),
      db.smtpConfigs.toArray(),
      db.emailLists.toArray(),
    ])
    setNewsletter(campaign ?? null)
    setSenders(nextSenders)
    setSmtpConfigs(nextSmtp)
    setLists(nextLists)
    setLoaded(true)
  }, [campaignId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!sending) void load()
  }, [sending, load])

  useEffect(() => {
    void loadSendLogsByNewsletter(campaignId).then(setSendLogs)
  }, [campaignId, sendProgress])

  useEffect(() => {
    if (!newsletter) {
      setRecipientCount(0)
      setPreviewContacts([])
      return
    }
    void countUniqueActiveRecipients(newsletter.listIds).then(setRecipientCount)
    void getUniqueActiveContacts(newsletter.listIds).then((contacts) => {
      setPreviewContacts(contacts)
      setPreviewContactEmail((current) => current || contacts[0]?.email || "")
    })
  }, [newsletter])

  function renderPreview(contactEmail?: string) {
    if (!newsletter) return
    const sender = senders.find((item) => item.id === newsletter.senderId)
    const contact = previewContacts.find((item) => item.email === (contactEmail || previewContactEmail))
    setPreviewHtml(
      buildCampaignPreviewHtml({
        blocks: parseCampaignBlocks(newsletter.htmlContent),
        signature: sender?.signature || "",
        unsubscribeEmail: sender?.unsubscribeEmail || sender?.email || "unsubscribe@example.com",
        contact,
      }),
    )
    setPreviewSubject(buildCampaignPreviewSubject(newsletter.subject, contact))
  }

  async function handleSendTest() {
    if (!newsletter || !testEmailAddress.trim()) return
    if (!isValidEmail(testEmailAddress)) {
      toast.error("Please enter a valid test email address")
      return
    }
    setSendingTest(true)

    const sender = senders.find((item) => item.id === newsletter.senderId)
    const smtpConfig = sender ? smtpConfigs.find((item) => item.id === sender.smtpConfigId) : null

    if (!sender || !smtpConfig) {
      toast.error("No sender or SMTP config found for this campaign")
      setSendingTest(false)
      return
    }

    const previewContact = previewContacts.find((item) => item.email === previewContactEmail)
    const mergeContact = previewContact
      ? { ...previewContact, email: testEmailAddress.trim() }
      : { email: testEmailAddress.trim(), firstName: "John", lastName: "Doe", customData: {} }
    const blocks = parseCampaignBlocks(newsletter.htmlContent)
    const unsubMailto = buildUnsubscribeMailto(sender.unsubscribeEmail || sender.email, testEmailAddress.trim())
    const html = replaceMergeFields(buildFullHtml(blocks, sender.signature, unsubMailto, false), mergeContact)
    const attachments = collectMailAttachments(blocks)

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
          subject: `[TEST] ${replaceMergeFields(newsletter.subject, mergeContact)}`,
          html,
          headers: {
            "List-Unsubscribe": `<${unsubMailto}>`,
          },
          attachments,
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
    if (!newsletter) return
    setRecipientCount(await countUniqueActiveRecipients(newsletter.listIds))
    setConfirmOpen(true)
  }

  async function handleResetToDraft() {
    if (!newsletter?.id) return
    await db.sendLogs.where("newsletterId").equals(newsletter.id).delete()
    await db.newsletters.update(newsletter.id, { status: "draft" })
    toast.info("Campaign reset to draft. All send logs cleared.")
    setResetConfirmOpen(false)
    router.push(campaignPhasePath(newsletter.id, "compose"))
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading campaign…</p>
  }

  if (!newsletter) {
    return (
      <Card className="compact-card">
        <CardContent className="empty-state">
          <p className="empty-state-title">Campaign not found</p>
          <p className="empty-state-description">This campaign is missing or was deleted.</p>
        </CardContent>
      </Card>
    )
  }

  const selectedAttachments = listCampaignAttachments(parseCampaignBlocks(newsletter.htmlContent))
  const senderReady = Boolean(newsletter.senderId)
  const listsReady = newsletter.listIds.length > 0
  const hasRecipients = recipientCount > 0
  const subjectReady = Boolean(newsletter.subject.trim())
  const smtpReady = Boolean(senders.find((item) => item.id === newsletter.senderId)?.smtpConfigId)
  const checklistReady = isSendReady({ senderReady, smtpReady, listsReady, hasRecipients, subjectReady })
  const remaining = Math.max(0, recipientCount - summarizeSendLogs(sendLogs).sent)
  const progressPct =
    sendProgress.total > 0 ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100 : 0

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="p-5">
          <div className="status-panel p-5">
            <div className="grid gap-4 text-sm md:grid-cols-[140px_1fr]">
              <span className="text-muted-foreground">Subject</span>
              <span className="font-medium text-foreground">{newsletter.subject || "Not set"}</span>

              <span className="text-muted-foreground">Sender</span>
              <span className="text-foreground">
                {senders.find((item) => item.id === newsletter.senderId)?.name || "Not set"}
              </span>

              <span className="text-muted-foreground">Target Lists</span>
              <div className="flex flex-wrap gap-1">
                {newsletter.listIds.map((lid) => (
                  <Badge key={lid} variant="outline" className="text-xs">
                    {lists.find((item) => item.id === lid)?.name || "Unknown"}
                  </Badge>
                ))}
                {newsletter.listIds.length === 0 && <span className="text-muted-foreground">No lists selected</span>}
              </div>

              <span className="text-muted-foreground">Recipients</span>
              <span className="text-foreground">{recipientCount}</span>

              <span className="text-muted-foreground">Status</span>
              <div>
                <CampaignStatusBadge status={newsletter.status} />
              </div>
            </div>

            {!checklistReady && (
              <ul className="mt-4 grid gap-1.5 text-sm">
                <li className={senderReady ? "text-foreground" : "text-destructive"}>
                  Sender: {senderReady ? "ready" : "missing — "}
                  {!senderReady && (
                    <Link href={campaignPhasePath(campaignId, "compose")} className="underline">
                      set it in Compose
                    </Link>
                  )}
                </li>
                <li className={smtpReady ? "text-foreground" : "text-destructive"}>
                  SMTP: {smtpReady ? "ready" : "missing — "}
                  {!smtpReady && (
                    <Link href="/smtp" className="underline">
                      open SMTP Config
                    </Link>
                  )}
                </li>
                <li className={listsReady ? "text-foreground" : "text-destructive"}>
                  Lists: {listsReady ? "selected" : "none — "}
                  {!listsReady && (
                    <Link href={campaignPhasePath(campaignId, "compose")} className="underline">
                      choose lists in Compose
                    </Link>
                  )}
                </li>
                <li className={hasRecipients ? "text-foreground" : "text-destructive"}>
                  Recipients: {hasRecipients ? recipientCount : "none — "}
                  {!hasRecipients && (
                    <Link href="/lists" className="underline">
                      add contacts
                    </Link>
                  )}
                </li>
                <li className={subjectReady ? "text-foreground" : "text-destructive"}>
                  Subject: {subjectReady ? "set" : "empty — "}
                  {!subjectReady && (
                    <Link href={campaignPhasePath(campaignId, "compose")} className="underline">
                      edit in Compose
                    </Link>
                  )}
                </li>
              </ul>
            )}

            <div className="action-cluster mt-4">
              <Button variant="outline" size="sm" onClick={() => { renderPreview(); setPreviewOpen(true) }}>
                <Eye className="mr-2 size-4" />
                Preview
              </Button>
              <Button variant="outline" size="sm" onClick={() => setTestEmailOpen(true)} disabled={!newsletter.senderId}>
                <Mail className="mr-2 size-4" />
                Send Test
              </Button>
              {newsletter.status === "draft" && (
                <Button size="sm" onClick={() => void prepareConfirm()} disabled={sending || !checklistReady}>
                  <Send className="mr-2 size-4" />
                  Send Now
                </Button>
              )}
              {(newsletter.status === "sending" || newsletter.status === "sent" || newsletter.status === "sent_with_errors") &&
                !isThisCampaignSending &&
                remaining > 0 && (
                  <Button
                    size="sm"
                    onClick={() => void startSend(campaignId)}
                    disabled={sending || !checklistReady}
                  >
                    <Send className="mr-2 size-4" />
                    {newsletter.status === "sending" ? "Resume Send" : "Send remaining"}
                  </Button>
                )}
              {newsletter.status === "sent_with_errors" && !isThisCampaignSending && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void startSend(campaignId, { retryFailedOnly: true })}
                  disabled={sending || !checklistReady}
                >
                  <RotateCcw className="mr-2 size-4" />
                  Retry failed
                </Button>
              )}
              {newsletter.status !== "draft" && !isThisCampaignSending && (
                <Button size="sm" variant="outline" onClick={() => setResetConfirmOpen(true)} disabled={sending}>
                  Reset to Draft
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isThisCampaignSending && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-3">
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
              <p className="mb-2 text-xs text-muted-foreground">Testing connection to your SMTP server before sending...</p>
            )}
            {(phase === "sending" || phase === "finishing") && (
              <>
                <Progress value={progressPct} className="mb-2" />
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span>Total: {sendProgress.total}</span>
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3" />
                    Sent: {sendProgress.sent}
                  </span>
                  <span className="flex items-center gap-1 text-destructive">
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
                        ETA:{" "}
                        {sendSpeed.etaSeconds < 60
                          ? `${Math.ceil(sendSpeed.etaSeconds)}s`
                          : `${Math.floor(sendSpeed.etaSeconds / 60)}m ${Math.ceil(sendSpeed.etaSeconds % 60)}s`}
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {sending && activeNewsletterId !== campaignId && (
        <Card className="border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Another campaign is currently being sent ({sendProgress.sent}/{sendProgress.total})
              </span>
              {activeNewsletterId != null && (
                <Button asChild variant="outline" size="sm" className="ml-auto">
                  <Link href={campaignPhasePath(activeNewsletterId, "send")}>Open that campaign</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              Confirm Send
            </DialogTitle>
            <DialogDescription>
              You are about to send <strong>{newsletter.subject}</strong> to{" "}
              <strong>{recipientCount} recipients</strong> across {newsletter.listIds.length} list(s). This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1.5 text-sm">
            <li className={senderReady ? "text-foreground" : "text-destructive"}>
              Sender: {senderReady ? "ready" : "missing"}
            </li>
            <li className={smtpReady ? "text-foreground" : "text-destructive"}>SMTP: {smtpReady ? "ready" : "missing"}</li>
            <li className={listsReady ? "text-foreground" : "text-destructive"}>
              Lists: {listsReady ? "selected" : "none"}
            </li>
            <li className={hasRecipients ? "text-foreground" : "text-destructive"}>Recipients: {recipientCount}</li>
            <li className={subjectReady ? "text-foreground" : "text-destructive"}>
              Subject: {subjectReady ? "set" : "empty"}
            </li>
            {newsletter.subject.length > 78 && (
              <li className="text-warning">Subject is longer than 78 characters and may be truncated by some clients.</li>
            )}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false)
                void startSend(campaignId)
              }}
              disabled={!checklistReady}
            >
              <Send className="mr-2 size-4" />
              Confirm Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          {previewSubject && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Subject: </span>
              {previewSubject}
            </p>
          )}
          {selectedAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedAttachments.map((item, index) => (
                <Badge key={`${item.filename}-${index}`} variant="outline" className="gap-1 font-normal">
                  <Paperclip className="size-3" />
                  {item.filename}
                  {item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
                  {item.inline ? " · inline" : ""}
                </Badge>
              ))}
            </div>
          )}
          {previewContacts.length > 0 && (
            <div className="grid gap-2">
              <Label>Preview as contact</Label>
              <Select
                value={previewContactEmail}
                onValueChange={(value) => {
                  setPreviewContactEmail(value)
                  renderPreview(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sample contact" />
                </SelectTrigger>
                <SelectContent>
                  {previewContacts.slice(0, 50).map((contact) => (
                    <SelectItem key={contact.email} value={contact.email}>
                      {contact.firstName || contact.lastName
                        ? `${contact.firstName} ${contact.lastName}`.trim() + ` <${contact.email}>`
                        : contact.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="overflow-auto rounded border bg-muted/30" style={{ height: "60vh" }}>
            <iframe srcDoc={previewHtml} className="size-full" title="Email preview" sandbox="allow-same-origin" />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-5" />
              Send Test Email
            </DialogTitle>
            <DialogDescription>
              Send a test copy of <strong>{newsletter.name}</strong> to any email address. Merge fields will be
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
                  void handleSendTest()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestEmailOpen(false)} disabled={sendingTest}>
              Cancel
            </Button>
            <Button onClick={() => void handleSendTest()} disabled={sendingTest || !testEmailAddress.trim()}>
              {sendingTest ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              {sendingTest ? "Sending..." : "Send Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset campaign to draft?</DialogTitle>
            <DialogDescription>
              This clears all send logs for this campaign and sets it back to draft. Recipients can be emailed again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleResetToDraft()}>
              Reset to draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { CampaignSend as SendCampaignSection }
