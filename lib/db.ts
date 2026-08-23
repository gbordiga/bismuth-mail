import Dexie, { type EntityTable } from "dexie"

// --- Types ---
export const DB_SCHEMA_VERSION = 7

export interface SmtpConfig {
  id?: number
  name: string
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  delayMs: number
  maxConnections: number
  createdAt: Date
}

export interface Sender {
  id?: number
  name: string
  email: string
  replyTo: string
  unsubscribeEmail: string // recipients send an email here to unsubscribe
  smtpConfigId: number
  signature: string // HTML
  createdAt: Date
}

export interface CustomField {
  name: string
  type: "text" | "number" | "date"
}

export interface EmailList {
  id?: number
  name: string
  description: string
  customFields: CustomField[]
  createdAt: Date
}

export interface Contact {
  id?: number
  listId: number
  email: string
  firstName: string
  lastName: string
  customData: Record<string, string>
  subscribedAt: Date
  unsubscribed: boolean
}

export interface Newsletter {
  id?: number
  name: string
  subject: string
  htmlContent: string
  senderId: number | null
  listIds: number[]
  status: "draft" | "sending" | "sent" | "sent_with_errors"
  sentAt: Date | null
  createdAt: Date
}

export interface SendLog {
  id?: number
  newsletterId: number
  contactEmail: string
  contactName: string
  status: "pending" | "sent" | "failed"
  attempt: number
  error?: string
  errorDetail?: string
  sentAt: Date | null
}

export interface SuppressedEmail {
  id?: number
  email: string
  reason: "unsubscribed" | "manual" | "invalid"
  createdAt: Date
}

// --- Database ---

const db = new Dexie("NewsletterApp") as Dexie & {
  smtpConfigs: EntityTable<SmtpConfig, "id">
  senders: EntityTable<Sender, "id">
  emailLists: EntityTable<EmailList, "id">
  contacts: EntityTable<Contact, "id">
  newsletters: EntityTable<Newsletter, "id">
  sendLogs: EntityTable<SendLog, "id">
  suppressedEmails: EntityTable<SuppressedEmail, "id">
}

db.version(1).stores({
  smtpConfigs: "++id, name, createdAt",
  senders: "++id, name, email, smtpConfigId, createdAt",
  emailLists: "++id, name, createdAt",
  contacts: "++id, listId, email, subscribedAt, unsubscribed",
  newsletters: "++id, name, status, createdAt",
  sendLogs: "++id, newsletterId, contactEmail, status",
})

db.version(2)
  .stores({
    smtpConfigs: "++id, name, createdAt",
    senders: "++id, name, email, smtpConfigId, createdAt",
    emailLists: "++id, name, createdAt",
    contacts: "++id, listId, email, subscribedAt, unsubscribed",
    newsletters: "++id, name, status, createdAt",
    sendLogs: "++id, newsletterId, contactEmail, status",
  })
  .upgrade((tx) => {
    return tx
      .table("smtpConfigs")
      .toCollection()
      .modify((config) => {
        if (config.delayMs === undefined) config.delayMs = 200
        if (config.batchSize === undefined) config.batchSize = 10
      })
  })

db.version(3)
  .stores({
    smtpConfigs: "++id, name, createdAt",
    senders: "++id, name, email, smtpConfigId, createdAt",
    emailLists: "++id, name, createdAt",
    contacts: "++id, listId, email, subscribedAt, unsubscribed",
    newsletters: "++id, name, status, createdAt",
    sendLogs: "++id, newsletterId, contactEmail, status",
  })
  .upgrade((tx) => {
    return tx
      .table("smtpConfigs")
      .toCollection()
      .modify((config) => {
        if (config.maxConnections === undefined) config.maxConnections = 5
        if (config.batchSize !== undefined && config.batchSize <= 10) config.batchSize = 50
        if (config.delayMs !== undefined && config.delayMs >= 200) config.delayMs = 0
      })
  })

db.version(4)
  .stores({
    smtpConfigs: "++id, name, createdAt",
    senders: "++id, name, email, smtpConfigId, createdAt",
    emailLists: "++id, name, createdAt",
    contacts: "++id, listId, email, subscribedAt, unsubscribed",
    newsletters: "++id, name, status, createdAt",
    sendLogs: "++id, newsletterId, contactEmail, status",
  })
  .upgrade((tx) => {
    return tx
      .table("smtpConfigs")
      .toCollection()
      .modify((config) => {
        delete config.batchSize
      })
  })

db.version(5)
  .stores({
    smtpConfigs: "++id, name, createdAt",
    senders: "++id, name, email, smtpConfigId, createdAt",
    emailLists: "++id, name, createdAt",
    contacts: "++id, listId, email, subscribedAt, unsubscribed",
    newsletters: "++id, name, status, createdAt",
    sendLogs: "++id, newsletterId, contactEmail, status",
  })
  .upgrade(async (tx) => {
    await tx
      .table("contacts")
      .toCollection()
      .modify((contact) => {
        if (typeof contact.email === "string") {
          contact.email = contact.email.trim().toLowerCase()
        }
      })

    await tx
      .table("senders")
      .toCollection()
      .modify((sender) => {
        if (!sender.unsubscribeEmail && typeof sender.email === "string") {
          sender.unsubscribeEmail = sender.email
        }
      })
  })

db.version(6)
  .stores({
    smtpConfigs: "++id, name, createdAt",
    senders: "++id, name, email, smtpConfigId, createdAt",
    emailLists: "++id, name, createdAt",
    contacts: "++id, listId, email, subscribedAt, unsubscribed",
    newsletters: "++id, name, status, createdAt",
    sendLogs: "++id, newsletterId, [newsletterId+contactEmail], status",
    suppressedEmails: "++id, &email, createdAt",
  })
  .upgrade(async (tx) => {
    const logs = await tx.table("sendLogs").toArray()
    const keep = new Map<string, { id: number; status: string; sentAt: Date | null }>()
    const removeIds: number[] = []

    for (const log of logs) {
      const key = `${log.newsletterId}::${String(log.contactEmail).trim().toLowerCase()}`
      const prev = keep.get(key)
      if (!prev) {
        keep.set(key, { id: log.id, status: log.status, sentAt: log.sentAt ?? null })
        continue
      }

      const preferCurrent =
        (log.status === "sent" && prev.status !== "sent") ||
        (log.status === prev.status && (log.id ?? 0) > prev.id)

      if (preferCurrent) {
        removeIds.push(prev.id)
        keep.set(key, { id: log.id, status: log.status, sentAt: log.sentAt ?? null })
      } else {
        removeIds.push(log.id)
      }
    }

    if (removeIds.length > 0) {
      await tx.table("sendLogs").bulkDelete(removeIds)
    }

    await tx
      .table("contacts")
      .toCollection()
      .modify((contact) => {
        if (typeof contact.email === "string") {
          contact.email = contact.email.trim().toLowerCase()
        }
      })

    const allContacts = await tx.table("contacts").toArray()
    const unsubscribed = allContacts.filter((contact) => Boolean(contact.unsubscribed))
    const seen = new Set<string>()
    for (const contact of unsubscribed) {
      const email = String(contact.email ?? "")
        .trim()
        .toLowerCase()
      if (!email || seen.has(email)) continue
      seen.add(email)
      await tx.table("suppressedEmails").add({
        email,
        reason: "unsubscribed",
        createdAt: new Date(),
      })
    }
  })

db.version(7)
  .stores({
    smtpConfigs: "++id, name, createdAt",
    senders: "++id, name, email, smtpConfigId, createdAt",
    emailLists: "++id, name, createdAt",
    contacts: "++id, listId, email, subscribedAt, unsubscribed",
    newsletters: "++id, name, status, createdAt",
    sendLogs: "++id, newsletterId, [newsletterId+contactEmail], status",
    suppressedEmails: "++id, &email, createdAt",
  })
  .upgrade(async (tx) => {
    const logs = await tx.table("sendLogs").toArray()
    const keep = new Map<string, { id: number; status: string }>()
    const removeIds: number[] = []

    for (const log of logs) {
      const email = String(log.contactEmail ?? "").trim().toLowerCase()
      const key = `${log.newsletterId}::${email}`
      const prev = keep.get(key)
      if (!prev) {
        keep.set(key, { id: log.id, status: log.status })
        continue
      }
      const preferCurrent =
        (log.status === "sent" && prev.status !== "sent") ||
        (log.status === prev.status && (log.id ?? 0) > prev.id)
      if (preferCurrent) {
        removeIds.push(prev.id)
        keep.set(key, { id: log.id, status: log.status })
      } else {
        removeIds.push(log.id)
      }
    }

    if (removeIds.length > 0) {
      await tx.table("sendLogs").bulkDelete(removeIds)
    }

    const remaining = logs.filter((log) => !removeIds.includes(log.id))
    for (const log of remaining) {
      const email = String(log.contactEmail ?? "").trim().toLowerCase()
      if (email && email !== log.contactEmail) {
        await tx.table("sendLogs").update(log.id, { contactEmail: email })
      }
    }
  })

export { db }
