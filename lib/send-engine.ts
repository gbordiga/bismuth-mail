import type { Contact, Newsletter, SendLog } from "@/lib/db"
import { normalizeEmail } from "@/lib/email"

export function computeMaxBatchSize(maxConnections: number, delayMs: number): number {
  const TIME_BUDGET_MS = 240_000
  const AVG_TIME_PER_EMAIL_MS = 500
  const RETRY_FACTOR = 1.5

  const byThroughput = Math.floor((TIME_BUDGET_MS * maxConnections) / (AVG_TIME_PER_EMAIL_MS * RETRY_FACTOR))

  let byTime: number
  if (delayMs > 0) {
    byTime = Math.min(Math.floor((TIME_BUDGET_MS - AVG_TIME_PER_EMAIL_MS * RETRY_FACTOR) / delayMs) + 1, byThroughput)
  } else {
    byTime = byThroughput
  }

  return Math.min(Math.max(byTime, 10), 500)
}

export function summarizeSendLogs(logs: SendLog[]): { sent: number; failed: number; pending: number } {
  let sent = 0
  let failed = 0
  let pending = 0
  for (const log of logs) {
    if (log.status === "sent") sent++
    else if (log.status === "failed") failed++
    else pending++
  }
  return { sent, failed, pending }
}

export function resolveCompletedCampaignStatus(failedCount: number): Extract<Newsletter["status"], "sent" | "sent_with_errors"> {
  return failedCount > 0 ? "sent_with_errors" : "sent"
}

export function campaignStatusLabel(status: Newsletter["status"]): string {
  switch (status) {
    case "draft":
      return "Draft"
    case "sending":
      return "Sending"
    case "sent":
      return "Sent"
    case "sent_with_errors":
      return "Sent with errors"
    default:
      return status
  }
}

export function selectContactsToSend(
  contacts: Contact[],
  logs: SendLog[],
  mode: "remaining" | "failed-only",
): Contact[] {
  const latestByEmail = new Map<string, SendLog>()
  for (const log of logs) {
    const email = normalizeEmail(log.contactEmail)
    const prev = latestByEmail.get(email)
    if (!prev || (log.id ?? 0) > (prev.id ?? 0)) {
      latestByEmail.set(email, { ...log, contactEmail: email })
    }
  }

  return contacts.filter((contact) => {
    const log = latestByEmail.get(normalizeEmail(contact.email))
    if (mode === "failed-only") return log?.status === "failed"
    return log?.status !== "sent"
  })
}
