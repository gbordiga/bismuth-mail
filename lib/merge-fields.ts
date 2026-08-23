export interface MergeContact {
  email: string
  firstName: string
  lastName: string
  customData?: Record<string, string>
}

export const SAMPLE_MERGE_CONTACT: MergeContact = {
  email: "john@example.com",
  firstName: "John",
  lastName: "Doe",
  customData: {},
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function replaceMergeFields(html: string, contact: MergeContact): string {
  let result = html
  result = result.replace(/\{\{email\}\}/g, escapeHtml(contact.email))
  result = result.replace(/\{\{firstName\}\}/g, escapeHtml(contact.firstName))
  result = result.replace(/\{\{lastName\}\}/g, escapeHtml(contact.lastName))
  if (contact.customData) {
    for (const [key, value] of Object.entries(contact.customData)) {
      result = result.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, "g"), escapeHtml(value || ""))
    }
  }
  return result
}
