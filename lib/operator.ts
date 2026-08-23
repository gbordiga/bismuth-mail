export function copyName(name: string): string {
  const trimmed = name.trim() || "Untitled"
  return `${trimmed} (copy)`
}

export function matchesQuery(query: string, ...fields: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return fields.some((field) => (field ?? "").toLowerCase().includes(needle))
}

export function filterByQuery<T>(
  items: T[],
  query: string,
  getFields: (item: T) => Array<string | null | undefined>,
): T[] {
  return items.filter((item) => matchesQuery(query, ...getFields(item)))
}

export function filterCampaigns<T extends { id?: number; name: string; subject: string }>(
  campaigns: T[],
  query: string,
  selectedId?: number | null,
): T[] {
  const filtered = filterByQuery(campaigns, query, (campaign) => [campaign.name, campaign.subject])
  if (selectedId == null || filtered.some((campaign) => campaign.id === selectedId)) {
    return filtered
  }
  const selected = campaigns.find((campaign) => campaign.id === selectedId)
  return selected ? [selected, ...filtered] : filtered
}

export type SendLogFilter = "all" | "sent" | "failed"

export function filterSendLogs<
  T extends { status: string; contactEmail: string; contactName: string; error?: string },
>(logs: T[], filter: SendLogFilter, query: string): T[] {
  return logs.filter((log) => {
    if (filter === "sent" && log.status !== "sent") return false
    if (filter === "failed" && log.status !== "failed") return false
    return matchesQuery(query, log.contactEmail, log.contactName, log.error)
  })
}

export type SubscriptionFilter = "all" | "subscribed" | "unsubscribed"

export function filterContacts<
  T extends { email: string; firstName: string; lastName: string; unsubscribed: boolean },
>(contacts: T[], query: string, subscription: SubscriptionFilter): T[] {
  return contacts.filter((contact) => {
    if (subscription === "subscribed" && contact.unsubscribed) return false
    if (subscription === "unsubscribed" && !contact.unsubscribed) return false
    return matchesQuery(query, contact.email, contact.firstName, contact.lastName)
  })
}

export function isSendReady(flags: {
  senderReady: boolean
  smtpReady: boolean
  listsReady: boolean
  hasRecipients: boolean
  subjectReady: boolean
}): boolean {
  return flags.senderReady && flags.smtpReady && flags.listsReady && flags.hasRecipients && flags.subjectReady
}

export type CampaignDraftFields = {
  name: string
  subject: string
  senderId: number | null
  listIds: number[]
  htmlContent: string
}

export function campaignDraftSnapshot(draft: CampaignDraftFields): string {
  return JSON.stringify({
    name: draft.name,
    subject: draft.subject,
    senderId: draft.senderId,
    listIds: draft.listIds,
    htmlContent: draft.htmlContent,
  })
}

export function isCampaignDraftDirty(current: CampaignDraftFields, baseline: string): boolean {
  return campaignDraftSnapshot(current) !== baseline
}

export function canPersistCampaignDraft(draft: Pick<CampaignDraftFields, "name" | "subject">): boolean {
  return draft.name.trim().length > 0 && draft.subject.trim().length > 0
}

export type CampaignLeaveAction = "close" | "save" | "confirm"

export function campaignLeaveAction(isDirty: boolean, canPersist: boolean): CampaignLeaveAction {
  if (!isDirty) return "close"
  if (canPersist) return "save"
  return "confirm"
}
