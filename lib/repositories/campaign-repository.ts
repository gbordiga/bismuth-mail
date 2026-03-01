import { db, type Contact, type EmailList, type Newsletter, type Sender, type SendLog, type SmtpConfig } from "@/lib/db"

export interface SendCampaignData {
  newsletters: Newsletter[]
  senders: Sender[]
  smtpConfigs: SmtpConfig[]
  lists: EmailList[]
}

export async function loadSendCampaignData(): Promise<SendCampaignData> {
  const [newsletters, senders, smtpConfigs, lists] = await Promise.all([
    db.newsletters.orderBy("createdAt").reverse().toArray(),
    db.senders.toArray(),
    db.smtpConfigs.toArray(),
    db.emailLists.toArray(),
  ])

  return { newsletters, senders, smtpConfigs, lists }
}

export async function loadSendLogsByNewsletter(newsletterId: number): Promise<SendLog[]> {
  return db.sendLogs.where("newsletterId").equals(newsletterId).toArray()
}

export async function getUniqueActiveContacts(listIds: number[]): Promise<Contact[]> {
  const allContacts: Contact[] = []
  const seenEmails = new Set<string>()

  for (const listId of listIds) {
    const contactsInList = await db.contacts
      .where("listId")
      .equals(listId)
      .filter((contact) => !contact.unsubscribed)
      .toArray()

    for (const contact of contactsInList) {
      const normalizedEmail = contact.email.trim().toLowerCase()
      if (!seenEmails.has(normalizedEmail)) {
        seenEmails.add(normalizedEmail)
        allContacts.push(contact)
      }
    }
  }

  return allContacts
}

export async function countUniqueActiveRecipients(listIds: number[]): Promise<number> {
  const contacts = await getUniqueActiveContacts(listIds)
  return contacts.length
}
