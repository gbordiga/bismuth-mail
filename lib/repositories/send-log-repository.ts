import { db, type SendLog } from "@/lib/db"

export async function upsertSendLog(log: Omit<SendLog, "id">): Promise<void> {
  const existing = await db.sendLogs.where("[newsletterId+contactEmail]").equals([log.newsletterId, log.contactEmail]).first()

  if (existing?.id != null) {
    await db.sendLogs.update(existing.id, {
      contactName: log.contactName,
      status: log.status,
      attempt: log.attempt,
      error: log.error,
      sentAt: log.sentAt,
    })
    return
  }

  await db.sendLogs.add(log)
}

export async function loadSendLogsByNewsletter(newsletterId: number): Promise<SendLog[]> {
  return db.sendLogs.where("newsletterId").equals(newsletterId).toArray()
}
