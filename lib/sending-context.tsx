"use client"

import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from "react"
import { db, type Contact } from "@/lib/db"
import { type EditorBlock, buildFullHtml } from "@/lib/email-builder"
import { toast } from "sonner"

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

export interface SendProgress {
  total: number
  sent: number
  failed: number
}

export interface SendSpeed {
  elapsed: number
  perSecond: number
  etaSeconds: number
}

export type SendPhase = "idle" | "preparing" | "checking-smtp" | "sending" | "finishing"

interface SendingContextValue {
  sending: boolean
  phase: SendPhase
  activeNewsletterId: number | null
  sendProgress: SendProgress
  sendSpeed: SendSpeed
  startSend: (newsletterId: number) => Promise<void>
  abortSend: () => void
}

const SendingContext = createContext<SendingContextValue | null>(null)

export function useSending() {
  const ctx = useContext(SendingContext)
  if (!ctx) throw new Error("useSending must be used within SendingProvider")
  return ctx
}

export function SendingProvider({ children }: { children: ReactNode }) {
  const [sending, setSending] = useState(false)
  const [phase, setPhase] = useState<SendPhase>("idle")
  const [activeNewsletterId, setActiveNewsletterId] = useState<number | null>(null)
  const [sendProgress, setSendProgress] = useState<SendProgress>({ total: 0, sent: 0, failed: 0 })
  const [sendSpeed, setSendSpeed] = useState<SendSpeed>({ elapsed: 0, perSecond: 0, etaSeconds: 0 })
  const abortRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sendStartTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!sending) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [sending])

  const abortSend = useCallback(() => {
    abortRef.current = true
    abortControllerRef.current?.abort()
    toast.info("Aborting...")
  }, [])

  const startSend = useCallback(async (newsletterId: number) => {
    if (sending) {
      toast.error("A send is already in progress")
      return
    }

    setSending(true)
    setPhase("preparing")
    setActiveNewsletterId(newsletterId)
    setSendProgress({ total: 0, sent: 0, failed: 0 })
    setSendSpeed({ elapsed: 0, perSecond: 0, etaSeconds: 0 })
    abortRef.current = false

    const newsletter = await db.newsletters.get(newsletterId)
    if (!newsletter) {
      toast.error("Campaign not found")
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      return
    }

    const sender = newsletter.senderId ? await db.senders.get(newsletter.senderId) : null
    const smtpConfig = sender?.smtpConfigId ? await db.smtpConfigs.get(sender.smtpConfigId) : null

    if (!sender || !smtpConfig) {
      toast.error("No sender or SMTP config found for this campaign")
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      return
    }

    // Pre-check SMTP connectivity before starting
    setPhase("checking-smtp")
    try {
      const testController = new AbortController()
      abortControllerRef.current = testController
      const testRes = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: testController.signal,
        body: JSON.stringify({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          username: smtpConfig.username,
          password: smtpConfig.password,
        }),
      })
      const testData = await testRes.json()
      if (!testData.success) {
        toast.error(`SMTP connection failed: ${testData.error}. Fix your SMTP config before sending.`)
        setSending(false)
        setPhase("idle")
        setActiveNewsletterId(null)
        return
      }
    } catch (err) {
      if (abortRef.current) {
        setSending(false)
        setPhase("idle")
        setActiveNewsletterId(null)
        toast.info("Send aborted.")
        return
      }
      toast.error(`SMTP connection check failed: ${String(err)}`)
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      return
    }

    if (abortRef.current) {
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      return
    }

    setPhase("sending")

    let blocks: EditorBlock[]
    try {
      blocks = JSON.parse(newsletter.htmlContent)
    } catch {
      blocks = [{ id: "raw", type: "html", content: newsletter.htmlContent, props: {} }]
    }

    const allContacts: Contact[] = []
    const seenEmails = new Set<string>()
    for (const lid of newsletter.listIds) {
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
      setPhase("idle")
      setActiveNewsletterId(null)
      return
    }

    const existingLogs = await db.sendLogs
      .where("newsletterId")
      .equals(newsletterId)
      .toArray()
    const alreadySent = new Set(
      existingLogs.filter((l) => l.status === "sent").map((l) => l.contactEmail),
    )
    const toSend = allContacts.filter((c) => !alreadySent.has(c.email))

    await db.newsletters.update(newsletterId, { status: "sending" })

    let sentCount = alreadySent.size
    let failedCount = existingLogs.filter((l) => l.status === "failed").length
    setSendProgress({ total: allContacts.length, sent: sentCount, failed: failedCount })

    if (toSend.length === 0) {
      await db.newsletters.update(newsletterId, { status: "sent", sentAt: new Date() })
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      toast.success("All emails were already sent.")
      return
    }

    const batchSize = smtpConfig.batchSize ?? 50
    const delayMs = smtpConfig.delayMs ?? 0
    const maxConnections = smtpConfig.maxConnections ?? 5
    const unsubEmail = sender.unsubscribeEmail || sender.email

    sendStartTimeRef.current = Date.now()
    const initialAlreadySent = alreadySent.size
    const initialFailed = failedCount

    function updateSpeed(sent: number, failed: number, total: number) {
      const elapsed = (Date.now() - sendStartTimeRef.current) / 1000
      const processed = (sent - initialAlreadySent) + (failed - initialFailed)
      const perSecond = elapsed > 0 ? processed / elapsed : 0
      const remaining = total - sent - failed
      const etaSeconds = perSecond > 0 ? remaining / perSecond : 0
      setSendSpeed({ elapsed, perSecond, etaSeconds })
    }

    for (let i = 0; i < toSend.length; i += batchSize) {
      if (abortRef.current) break

      const batch = toSend.slice(i, i + batchSize)
      const recipients = batch.map((contact) => {
        const mailtoHref = `mailto:${unsubEmail}?subject=${encodeURIComponent("UNSUBSCRIBE")}&body=${encodeURIComponent(`Please remove ${contact.email} from this mailing list.`)}`
        const fullHtml = buildFullHtml(blocks, sender.signature, mailtoHref)
        return {
          to: contact.email,
          subject: replaceMergeFields(newsletter.subject, contact),
          html: replaceMergeFields(fullHtml, contact),
        }
      })

      try {
        const batchController = new AbortController()
        abortControllerRef.current = batchController

        const res = await fetch("/api/smtp/send-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: batchController.signal,
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
            maxConnections,
          }),
        })

        const data = await res.json()
        if (data.results) {
          for (const r of data.results as { email: string; status: "sent" | "failed"; attempts: number; error?: string }[]) {
            const contact = batch.find((c) => c.email === r.email)
            const contactName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : r.email
            if (r.status === "sent") sentCount++
            else failedCount++
            await db.sendLogs.add({
              newsletterId,
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
              newsletterId,
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
        if (abortRef.current) break

        for (const contact of batch) {
          failedCount++
          await db.sendLogs.add({
            newsletterId,
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
      updateSpeed(sentCount, failedCount, allContacts.length)
    }

    setPhase("finishing")

    if (abortRef.current) {
      await db.newsletters.update(newsletterId, { status: "sending" })
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      toast.info(
        `Campaign paused. ${sentCount} delivered, ${failedCount} failed, ${allContacts.length - sentCount - failedCount} remaining. You can resume later.`,
      )
    } else {
      await db.newsletters.update(newsletterId, { status: "sent", sentAt: new Date() })
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      toast.success(`Campaign sent! ${sentCount} delivered, ${failedCount} failed.`)
    }
  }, [sending])

  return (
    <SendingContext.Provider value={{ sending, phase, activeNewsletterId, sendProgress, sendSpeed, startSend, abortSend }}>
      {children}
    </SendingContext.Provider>
  )
}
