import { db, type Contact, type EmailList, type Newsletter, type Sender, type SmtpConfig } from "@/lib/db"
import { getSuppressedEmailSet } from "@/lib/repositories/suppression-repository"
import { loadSendLogsByNewsletter } from "@/lib/repositories/send-log-repository"

export interface SendCampaignData {
  newsletters: Newsletter[]
  senders: Sender[]
  smtpConfigs: SmtpConfig[]
  lists: EmailList[]
}

export { loadSendLogsByNewsletter }

export async function loadSendCampaignData(): Promise<SendCampaignData> {
  const [newsletters, senders, smtpConfigs, lists] = await Promise.all([
    db.newsletters.orderBy("createdAt").reverse().toArray(),
    db.senders.toArray(),
    db.smtpConfigs.toArray(),
    db.emailLists.toArray(),
  ])

  return { newsletters, senders, smtpConfigs, lists }
}

export async function getUniqueActiveContacts(listIds: number[]): Promise<Contact[]> {
  const allContacts: Contact[] = []
  const seenEmails = new Set<string>()
  const suppressed = await getSuppressedEmailSet()

  for (const listId of listIds) {
    const contactsInList = await db.contacts
      .where("listId")
      .equals(listId)
      .filter((contact) => !contact.unsubscribed)
      .toArray()

    for (const contact of contactsInList) {
      const normalizedEmail = contact.email.trim().toLowerCase()
      if (seenEmails.has(normalizedEmail) || suppressed.has(normalizedEmail)) continue
      seenEmails.add(normalizedEmail)
      allContacts.push(contact)
    }
  }

  return allContacts
}

export async function countUniqueActiveRecipients(listIds: number[]): Promise<number> {
  const contacts = await getUniqueActiveContacts(listIds)
  return contacts.length
}
