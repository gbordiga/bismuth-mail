"use client"

import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from "react"
import { db } from "@/lib/db"
import { parseCampaignBlocks } from "@/lib/preview"
import { getUniqueActiveContacts } from "@/lib/repositories/campaign-repository"
import { upsertSendLog } from "@/lib/repositories/send-log-repository"
import { normalizeEmail } from "@/lib/email"
import {
  computeMaxBatchSize,
  resolveCompletedCampaignStatus,
  selectContactsToSend,
  summarizeSendLogs,
} from "@/lib/send-engine"
import { toast } from "sonner"

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
  startSend: (newsletterId: number, options?: { retryFailedOnly?: boolean }) => Promise<void>
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

  const startSend = useCallback(async (newsletterId: number, options?: { retryFailedOnly?: boolean }) => {
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
        const message = testData.message ?? testData.error ?? "Unknown SMTP error"
        toast.error(`SMTP connection failed: ${message}. Fix your SMTP config before sending.`)
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

    const blocks = parseCampaignBlocks(newsletter.htmlContent)
    const allContacts = await getUniqueActiveContacts(newsletter.listIds)

    if (allContacts.length === 0) {
      toast.error("No active recipients found in the selected lists")
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      return
    }

    const existingLogs = await db.sendLogs.where("newsletterId").equals(newsletterId).toArray()
    const logMap = new Map(existingLogs.map((log) => [normalizeEmail(log.contactEmail), { ...log, contactEmail: normalizeEmail(log.contactEmail) }]))
    const toSend = selectContactsToSend(
      allContacts,
      [...logMap.values()],
      options?.retryFailedOnly ? "failed-only" : "remaining",
    )

    await db.newsletters.update(newsletterId, { status: "sending" })

    let { sent: sentCount, failed: failedCount } = summarizeSendLogs([...logMap.values()])
    setSendProgress({ total: allContacts.length, sent: sentCount, failed: failedCount })

    if (toSend.length === 0) {
      const status = resolveCompletedCampaignStatus(failedCount)
      await db.newsletters.update(newsletterId, { status, sentAt: new Date() })
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      toast.success(failedCount > 0 ? "No remaining failed recipients to retry." : "All emails were already sent.")
      return
    }

    const delayMs = smtpConfig.delayMs ?? 0
    const maxConnections = smtpConfig.maxConnections ?? 5
    const batchSize = computeMaxBatchSize(maxConnections, delayMs)
    const unsubEmail = sender.unsubscribeEmail || sender.email

    sendStartTimeRef.current = Date.now()
    let processedThisRun = 0

    function updateSpeed(sent: number, failed: number, total: number) {
      const elapsed = (Date.now() - sendStartTimeRef.current) / 1000
      const perSecond = elapsed > 0 ? processedThisRun / elapsed : 0
      const remaining = total - sent - failed
      const etaSeconds = perSecond > 0 ? remaining / perSecond : 0
      setSendSpeed({ elapsed, perSecond, etaSeconds })
    }

    for (let i = 0; i < toSend.length; i += batchSize) {
      if (abortRef.current) break

      const batch = toSend.slice(i, i + batchSize)
      const contacts = batch.map((c) => ({
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        customData: c.customData,
      }))

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
            subjectTemplate: newsletter.subject,
            blocks,
            signature: sender.signature,
            unsubscribeEmail: unsubEmail,
            contacts,
            delayMs,
            maxRetries: 2,
            maxConnections,
          }),
        })

        const data = await res.json()
        const batchResults = data.results ?? data.details?.results
        if (batchResults) {
          for (const r of batchResults as {
            email: string
            status: "sent" | "failed"
            attempts: number
            error?: string
          }[]) {
            const contact = batch.find((c) => normalizeEmail(c.email) === normalizeEmail(r.email))
            const contactName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : r.email
            await upsertSendLog({
              newsletterId,
              contactEmail: r.email,
              contactName,
              status: r.status,
              attempt: r.attempts,
              error: r.error,
              sentAt: new Date(),
            })
            logMap.set(normalizeEmail(r.email), {
              newsletterId,
              contactEmail: normalizeEmail(r.email),
              contactName,
              status: r.status,
              attempt: r.attempts,
              error: r.error,
              sentAt: new Date(),
            })
          }
        } else {
          for (const contact of batch) {
            await upsertSendLog({
              newsletterId,
              contactEmail: contact.email,
              contactName: `${contact.firstName} ${contact.lastName}`.trim(),
              status: "failed",
              attempt: 1,
              error: data.message ?? data.error ?? "Batch request failed",
              sentAt: new Date(),
            })
            logMap.set(normalizeEmail(contact.email), {
              newsletterId,
              contactEmail: normalizeEmail(contact.email),
              contactName: `${contact.firstName} ${contact.lastName}`.trim(),
              status: "failed",
              attempt: 1,
              error: data.message ?? data.error ?? "Batch request failed",
              sentAt: new Date(),
            })
          }
        }
      } catch (err) {
        if (abortRef.current) break

        for (const contact of batch) {
          await upsertSendLog({
            newsletterId,
            contactEmail: contact.email,
            contactName: `${contact.firstName} ${contact.lastName}`.trim(),
            status: "failed",
            attempt: 1,
            error: String(err),
            sentAt: new Date(),
          })
          logMap.set(normalizeEmail(contact.email), {
            newsletterId,
            contactEmail: normalizeEmail(contact.email),
            contactName: `${contact.firstName} ${contact.lastName}`.trim(),
            status: "failed",
            attempt: 1,
            error: String(err),
            sentAt: new Date(),
          })
        }
      }

      processedThisRun += batch.length
      ;({ sent: sentCount, failed: failedCount } = summarizeSendLogs([...logMap.values()]))
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
      const status = resolveCompletedCampaignStatus(failedCount)
      await db.newsletters.update(newsletterId, { status, sentAt: new Date() })
      setSending(false)
      setPhase("idle")
      setActiveNewsletterId(null)
      toast.success(
        failedCount > 0
          ? `Campaign finished with errors. ${sentCount} delivered, ${failedCount} failed.`
          : `Campaign sent! ${sentCount} delivered.`,
      )
    }
  }, [sending])

  return (
    <SendingContext.Provider value={{ sending, phase, activeNewsletterId, sendProgress, sendSpeed, startSend, abortSend }}>
      {children}
    </SendingContext.Provider>
  )
}
