import { db, type SuppressedEmail } from "@/lib/db"
import { normalizeEmail } from "@/lib/email"

export async function getSuppressedEmailSet(): Promise<Set<string>> {
  const rows = await db.suppressedEmails.toArray()
  return new Set(rows.map((row) => row.email))
}

export async function listSuppressedEmails(): Promise<SuppressedEmail[]> {
  return db.suppressedEmails.orderBy("createdAt").reverse().toArray()
}

export async function suppressEmail(email: string, reason: SuppressedEmail["reason"]): Promise<void> {
  const normalized = normalizeEmail(email)
  const existing = await db.suppressedEmails.where("email").equals(normalized).first()
  if (existing) return
  await db.suppressedEmails.add({
    email: normalized,
    reason,
    createdAt: new Date(),
  })
}

export async function unsuppressEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email)
  await db.suppressedEmails.where("email").equals(normalized).delete()
}

export async function setEmailSubscription(email: string, unsubscribed: boolean): Promise<void> {
  const normalized = normalizeEmail(email)
  const contacts = await db.contacts.filter((contact) => contact.email === normalized).toArray()

  await Promise.all(
    contacts.map((contact) => {
      if (contact.id == null) return Promise.resolve()
      return db.contacts.update(contact.id, { unsubscribed })
    }),
  )

  if (unsubscribed) {
    await suppressEmail(normalized, "unsubscribed")
  } else {
    await unsuppressEmail(normalized)
  }
}
