import { db, type SendLog } from "@/lib/db"
import { sendLogWritePayload } from "@/lib/send-engine"

export async function upsertSendLog(log: Omit<SendLog, "id">): Promise<void> {
  const payload = sendLogWritePayload(log)
  const existing = await db.sendLogs
    .where("[newsletterId+contactEmail]")
    .equals([log.newsletterId, payload.contactEmail])
    .first()

  if (existing?.id != null) {
    await db.sendLogs.update(existing.id, {
      contactName: payload.contactName,
      status: payload.status,
      attempt: payload.attempt,
      error: payload.error,
      sentAt: payload.sentAt,
    })
    return
  }

  await db.sendLogs.add(payload)
}

export async function loadSendLogsByNewsletter(newsletterId: number): Promise<SendLog[]> {
  return db.sendLogs.where("newsletterId").equals(newsletterId).toArray()
}
