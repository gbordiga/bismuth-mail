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
