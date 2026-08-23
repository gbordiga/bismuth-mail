import { describe, expect, it } from "vitest"
import { normalizeBackup } from "@/lib/backup"

describe("normalizeBackup", () => {
  it("normalizes v2 backups and defaults suppressed emails", () => {
    const backup = normalizeBackup({
      version: 2,
      exportedAt: "2026-08-23T00:00:00.000Z",
      appVersion: "0.2.11",
      dbSchemaVersion: 5,
      payload: {
        smtpConfigs: [{}],
        senders: [],
        emailLists: [],
        contacts: [],
        newsletters: [],
        sendLogs: [],
      },
    })

    expect(backup?.payload.suppressedEmails).toEqual([])
    expect(backup?.appVersion).toBe("0.2.11")
  })

  it("migrates v1 backups", () => {
    const backup = normalizeBackup({
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      smtpConfigs: [],
      senders: [],
      emailLists: [],
      contacts: [],
      newsletters: [],
      sendLogs: [],
    })

    expect(backup?.version).toBe(2)
    expect(backup?.appVersion).toBe("legacy-v1")
    expect(backup?.payload.suppressedEmails).toEqual([])
  })

  it("rejects invalid payloads", () => {
    expect(normalizeBackup({ version: 2, exportedAt: "x" })).toBeNull()
    expect(normalizeBackup(null)).toBeNull()
  })
})
