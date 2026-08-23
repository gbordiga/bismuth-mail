import { normalizeEmail } from "@/lib/email"

export interface BackupPayload {
  smtpConfigs: unknown[]
  senders: unknown[]
  emailLists: unknown[]
  contacts: unknown[]
  newsletters: unknown[]
  sendLogs: unknown[]
  suppressedEmails: unknown[]
}

export interface BackupDataV2 {
  version: 2
  exportedAt: string
  appVersion: string
  dbSchemaVersion: number
  payload: BackupPayload
}

export type BackupData = BackupDataV2

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function hasCoreTables(payload: Partial<BackupPayload>): payload is BackupPayload {
  return (
    Array.isArray(payload.smtpConfigs) &&
    Array.isArray(payload.senders) &&
    Array.isArray(payload.emailLists) &&
    Array.isArray(payload.contacts) &&
    Array.isArray(payload.newsletters) &&
    Array.isArray(payload.sendLogs)
  )
}

export function normalizeBackup(input: unknown): BackupData | null {
  if (!isRecord(input) || typeof input.version !== "number" || typeof input.exportedAt !== "string") {
    return null
  }

  if (input.version === 2 && isRecord(input.payload)) {
    const payload = input.payload as Partial<BackupPayload>
    if (hasCoreTables(payload)) {
      return {
        version: 2,
        exportedAt: input.exportedAt,
        appVersion: typeof input.appVersion === "string" ? input.appVersion : "unknown",
        dbSchemaVersion: typeof input.dbSchemaVersion === "number" ? input.dbSchemaVersion : 0,
        payload: {
          ...payload,
          suppressedEmails: Array.isArray(payload.suppressedEmails) ? payload.suppressedEmails : [],
        },
      }
    }
  }

  if (input.version === 1) {
    const exportedAt = typeof input.exportedAt === "string" ? input.exportedAt : new Date(0).toISOString()
    if (hasCoreTables(input)) {
      return {
        version: 2,
        exportedAt,
        appVersion: "legacy-v1",
        dbSchemaVersion: 0,
        payload: {
          smtpConfigs: input.smtpConfigs,
          senders: input.senders,
          emailLists: input.emailLists,
          contacts: input.contacts,
          newsletters: input.newsletters,
          sendLogs: input.sendLogs,
          suppressedEmails: [],
        },
      }
    }
  }

  return null
}

function asRecords(value: unknown[]): Record<string, unknown>[] {
  return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
}

function preferSentLog(current: Record<string, unknown>, previous: Record<string, unknown>): Record<string, unknown> {
  if (current.status === "sent" && previous.status !== "sent") return current
  const currentId = typeof current.id === "number" ? current.id : 0
  const previousId = typeof previous.id === "number" ? previous.id : 0
  return currentId >= previousId ? current : previous
}

function reviveDates(records: Record<string, unknown>[], fields: string[]): Record<string, unknown>[] {
  return records.map((record) => {
    const next = { ...record }
    for (const field of fields) {
      const value = next[field]
      if (typeof value === "string" && value) {
        const parsed = new Date(value)
        if (!Number.isNaN(parsed.getTime())) next[field] = parsed
      }
    }
    return next
  })
}

export function prepareRestorePayload(payload: BackupPayload): BackupPayload {
  const suppressedByEmail = new Map<string, Record<string, unknown>>()
  for (const row of asRecords(payload.suppressedEmails)) {
    const email = normalizeEmail(String(row.email ?? ""))
    if (!email) continue
    if (!suppressedByEmail.has(email)) {
      suppressedByEmail.set(email, { ...row, email })
    }
  }

  const contacts = asRecords(payload.contacts).map((contact) => {
    const email = normalizeEmail(String(contact.email ?? ""))
    const unsubscribed = Boolean(contact.unsubscribed) || suppressedByEmail.has(email)
    if (unsubscribed && email) {
      suppressedByEmail.set(email, suppressedByEmail.get(email) ?? {
        email,
        reason: "unsubscribed",
        createdAt: new Date().toISOString(),
      })
    }
    return { ...contact, email, unsubscribed }
  })

  const logsByKey = new Map<string, Record<string, unknown>>()
  for (const log of asRecords(payload.sendLogs)) {
    const email = normalizeEmail(String(log.contactEmail ?? ""))
    const newsletterId = log.newsletterId
    if (!email || newsletterId == null) continue
    const key = `${String(newsletterId)}::${email}`
    const normalized = { ...log, contactEmail: email }
    const prev = logsByKey.get(key)
    logsByKey.set(key, prev ? preferSentLog(normalized, prev) : normalized)
  }

  return {
    ...payload,
    smtpConfigs: reviveDates(asRecords(payload.smtpConfigs), ["createdAt"]),
    senders: reviveDates(asRecords(payload.senders), ["createdAt"]),
    emailLists: reviveDates(asRecords(payload.emailLists), ["createdAt"]),
    contacts: reviveDates(contacts, ["subscribedAt"]),
    newsletters: reviveDates(asRecords(payload.newsletters), ["createdAt", "sentAt"]),
    sendLogs: reviveDates([...logsByKey.values()], ["sentAt"]),
    suppressedEmails: reviveDates([...suppressedByEmail.values()], ["createdAt"]),
  }
}
