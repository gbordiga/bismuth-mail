import Dexie, { type EntityTable } from "dexie"

// --- Types ---

export interface SmtpConfig {
  id?: number
  name: string
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  delayMs: number
  batchSize?: number
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
  status: "draft" | "sending" | "sent"
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
  sentAt: Date | null
}

// --- Database ---

const db = new Dexie("NewsletterApp") as Dexie & {
  smtpConfigs: EntityTable<SmtpConfig, "id">
  senders: EntityTable<Sender, "id">
  emailLists: EntityTable<EmailList, "id">
  contacts: EntityTable<Contact, "id">
  newsletters: EntityTable<Newsletter, "id">
  sendLogs: EntityTable<SendLog, "id">
}

db.version(1).stores({
  smtpConfigs: "++id, name, createdAt",
  senders: "++id, name, email, smtpConfigId, createdAt",
  emailLists: "++id, name, createdAt",
  contacts: "++id, listId, email, subscribedAt, unsubscribed",
  newsletters: "++id, name, status, createdAt",
  sendLogs: "++id, newsletterId, contactEmail, status",
})

db.version(2).stores({
  smtpConfigs: "++id, name, createdAt",
  senders: "++id, name, email, smtpConfigId, createdAt",
  emailLists: "++id, name, createdAt",
  contacts: "++id, listId, email, subscribedAt, unsubscribed",
  newsletters: "++id, name, status, createdAt",
  sendLogs: "++id, newsletterId, contactEmail, status",
}).upgrade(tx => {
  return tx.table("smtpConfigs").toCollection().modify(config => {
    if (config.delayMs === undefined) config.delayMs = 200
    if (config.batchSize === undefined) config.batchSize = 10
  })
})

db.version(3).stores({
  smtpConfigs: "++id, name, createdAt",
  senders: "++id, name, email, smtpConfigId, createdAt",
  emailLists: "++id, name, createdAt",
  contacts: "++id, listId, email, subscribedAt, unsubscribed",
  newsletters: "++id, name, status, createdAt",
  sendLogs: "++id, newsletterId, contactEmail, status",
}).upgrade(tx => {
  return tx.table("smtpConfigs").toCollection().modify(config => {
    if (config.maxConnections === undefined) config.maxConnections = 5
    if (config.batchSize !== undefined && config.batchSize <= 10) config.batchSize = 50
    if (config.delayMs !== undefined && config.delayMs >= 200) config.delayMs = 0
  })
})

db.version(4).stores({
  smtpConfigs: "++id, name, createdAt",
  senders: "++id, name, email, smtpConfigId, createdAt",
  emailLists: "++id, name, createdAt",
  contacts: "++id, listId, email, subscribedAt, unsubscribed",
  newsletters: "++id, name, status, createdAt",
  sendLogs: "++id, newsletterId, contactEmail, status",
}).upgrade(tx => {
  return tx.table("smtpConfigs").toCollection().modify(config => {
    delete config.batchSize
  })
})

export { db }
