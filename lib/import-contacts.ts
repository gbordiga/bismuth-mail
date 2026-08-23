import { isValidEmail, normalizeEmail } from "@/lib/email"

export function parseUnsubscribedFlag(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "unsubscribed"
}

export interface ContactImportRow {
  email: string
  firstName: string
  lastName: string
  customData: Record<string, string>
  unsubscribed: boolean
}

export interface ContactImportPlan {
  toAdd: ContactImportRow[]
  invalid: number
  duplicatesInFile: number
  alreadyInList: number
  suppressedSkipped: number
}

export function planContactImport(args: {
  dataRows: string[][]
  mapping: {
    email: number
    firstName?: number
    lastName?: number
    unsubscribed?: number
    custom: Record<string, number>
  }
  existingEmails: Iterable<string>
  suppressedEmails: Iterable<string>
}): ContactImportPlan {
  const existing = new Set(Array.from(args.existingEmails, (email) => normalizeEmail(email)))
  const suppressed = new Set(Array.from(args.suppressedEmails, (email) => normalizeEmail(email)))
  const seenInFile = new Set<string>()
  const toAdd: ContactImportRow[] = []
  let invalid = 0
  let duplicatesInFile = 0
  let alreadyInList = 0
  let suppressedSkipped = 0

  for (const row of args.dataRows) {
    const email = normalizeEmail(row[args.mapping.email] ?? "")
    if (!isValidEmail(email)) {
      invalid++
      continue
    }
    if (seenInFile.has(email)) {
      duplicatesInFile++
      continue
    }
    seenInFile.add(email)
    if (existing.has(email)) {
      alreadyInList++
      continue
    }
    if (suppressed.has(email)) {
      suppressedSkipped++
      continue
    }

    const customData: Record<string, string> = {}
    for (const [name, index] of Object.entries(args.mapping.custom)) {
      const value = row[index]?.trim()
      if (value) customData[name] = value
    }

    toAdd.push({
      email,
      firstName: args.mapping.firstName !== undefined ? (row[args.mapping.firstName]?.trim() ?? "") : "",
      lastName: args.mapping.lastName !== undefined ? (row[args.mapping.lastName]?.trim() ?? "") : "",
      customData,
      unsubscribed: parseUnsubscribedFlag(
        args.mapping.unsubscribed !== undefined ? row[args.mapping.unsubscribed] : undefined,
      ),
    })
  }

  return { toAdd, invalid, duplicatesInFile, alreadyInList, suppressedSkipped }
}
