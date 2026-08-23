import { describe, expect, it } from "vitest"
import type { Contact, SendLog } from "@/lib/db"
import {
  computeMaxBatchSize,
  resolveCompletedCampaignStatus,
  selectContactsToSend,
  sendLogWritePayload,
  summarizeSendLogs,
} from "@/lib/send-engine"

function contact(email: string): Contact {
  return {
    listId: 1,
    email,
    firstName: "A",
    lastName: "B",
    customData: {},
    subscribedAt: new Date(),
    unsubscribed: false,
  }
}

function log(email: string, status: SendLog["status"], id: number): SendLog {
  return {
    id,
    newsletterId: 1,
    contactEmail: email,
    contactName: email,
    status,
    attempt: 1,
    sentAt: new Date(),
  }
}

describe("computeMaxBatchSize", () => {
  it("clamps between 10 and 500", () => {
    expect(computeMaxBatchSize(1, 10_000)).toBeGreaterThanOrEqual(10)
    expect(computeMaxBatchSize(20, 0)).toBeLessThanOrEqual(500)
  })
})

describe("summarizeSendLogs", () => {
  it("counts sent, failed, and pending", () => {
    expect(summarizeSendLogs([log("a@b.com", "sent", 1), log("c@d.com", "failed", 2), log("e@f.com", "pending", 3)])).toEqual({
      sent: 1,
      failed: 1,
      pending: 1,
    })
  })
})

describe("resolveCompletedCampaignStatus", () => {
  it("uses sent_with_errors when any delivery failed", () => {
    expect(resolveCompletedCampaignStatus(0)).toBe("sent")
    expect(resolveCompletedCampaignStatus(2)).toBe("sent_with_errors")
  })

  it("keeps sending when recipients were never attempted", () => {
    expect(resolveCompletedCampaignStatus(0, 3)).toBe("sending")
    expect(resolveCompletedCampaignStatus(2, 1)).toBe("sending")
  })
})

describe("sendLogWritePayload", () => {
  it("clears a previous error when a later attempt succeeds", () => {
    expect(
      sendLogWritePayload({
        newsletterId: 1,
        contactEmail: "Ada@Example.com",
        contactName: "Ada",
        status: "sent",
        attempt: 2,
        error: "Invalid request payload",
        errorDetail: '{"code":"VALIDATION_ERROR"}',
        sentAt: new Date("2026-08-23T00:00:00.000Z"),
      }),
    ).toMatchObject({
      contactEmail: "ada@example.com",
      status: "sent",
      error: "",
      errorDetail: "",
    })
  })
})

describe("selectContactsToSend", () => {
  const contacts = [contact("ok@example.com"), contact("fail@example.com"), contact("new@example.com")]
  const logs = [log("ok@example.com", "sent", 1), log("fail@example.com", "failed", 2)]

  it("selects everyone not already sent for remaining mode", () => {
    expect(selectContactsToSend(contacts, logs, "remaining").map((item) => item.email)).toEqual([
      "fail@example.com",
      "new@example.com",
    ])
  })

  it("selects only failed recipients for retry mode", () => {
    expect(selectContactsToSend(contacts, logs, "failed-only").map((item) => item.email)).toEqual(["fail@example.com"])
  })

  it("treats mixed-case emails as the same recipient", () => {
    const mixed = [contact("OK@example.com"), contact("Fail@example.com"), contact("new@example.com")]
    const mixedLogs = [log("ok@example.com", "sent", 1), log("FAIL@example.com", "failed", 2)]
    expect(selectContactsToSend(mixed, mixedLogs, "remaining").map((item) => item.email)).toEqual([
      "Fail@example.com",
      "new@example.com",
    ])
    expect(selectContactsToSend(mixed, mixedLogs, "failed-only").map((item) => item.email)).toEqual(["Fail@example.com"])
  })
})
