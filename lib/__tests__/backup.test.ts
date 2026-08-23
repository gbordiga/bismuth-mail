import { describe, expect, it } from "vitest"
import { normalizeBackup, prepareRestorePayload } from "@/lib/backup"

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

describe("prepareRestorePayload", () => {
  it("normalizes emails, dedupes logs, and restores Date objects", () => {
    const payload = prepareRestorePayload({
      smtpConfigs: [{ createdAt: "2026-08-01T00:00:00.000Z" }],
      senders: [],
      emailLists: [],
      contacts: [
        { email: "Ada@Example.com", unsubscribed: false, subscribedAt: "2026-08-02T00:00:00.000Z" },
        { email: "suppressed@example.com", unsubscribed: false },
      ],
      newsletters: [],
      sendLogs: [
        { newsletterId: 1, contactEmail: "Ada@Example.com", status: "failed", id: 1 },
        { newsletterId: 1, contactEmail: "ada@example.com", status: "sent", id: 2, sentAt: "2026-08-03T00:00:00.000Z" },
      ],
      suppressedEmails: [{ email: "Suppressed@Example.com", reason: "manual" }],
    })

    expect(payload.contacts).toEqual([
      expect.objectContaining({ email: "ada@example.com", unsubscribed: false, subscribedAt: expect.any(Date) }),
      expect.objectContaining({ email: "suppressed@example.com", unsubscribed: true }),
    ])
    expect(payload.sendLogs).toEqual([
      expect.objectContaining({
        newsletterId: 1,
        contactEmail: "ada@example.com",
        status: "sent",
        sentAt: expect.any(Date),
      }),
    ])
    expect(payload.suppressedEmails.map((row) => (row as { email: string }).email)).toEqual([
      "suppressed@example.com",
    ])
    expect(payload.smtpConfigs[0]).toEqual(expect.objectContaining({ createdAt: expect.any(Date) }))
  })
})
