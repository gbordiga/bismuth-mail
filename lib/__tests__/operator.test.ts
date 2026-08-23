import { describe, expect, it } from "vitest"
import {
  campaignDraftSnapshot,
  campaignLeaveAction,
  canPersistCampaignDraft,
  copyName,
  filterCampaigns,
  filterContacts,
  filterSendLogs,
  isCampaignDraftDirty,
  isSendReady,
  matchesQuery,
} from "@/lib/operator"

describe("copyName", () => {
  it("appends (copy) and falls back when the name is blank", () => {
    expect(copyName("Launch list")).toBe("Launch list (copy)")
    expect(copyName("  ")).toBe("Untitled (copy)")
  })
})

describe("matchesQuery", () => {
  it("matches any field case-insensitively and treats a blank query as a match", () => {
    expect(matchesQuery("", "Ada")).toBe(true)
    expect(matchesQuery("ADA", "ada@example.com", "Lovelace")).toBe(true)
    expect(matchesQuery("zzz", "ada@example.com")).toBe(false)
  })
})

describe("filterCampaigns", () => {
  const campaigns = [
    { id: 1, name: "Welcome", subject: "Hello there" },
    { id: 2, name: "Promo", subject: "Spring sale" },
  ]

  it("filters by name or subject and keeps the selected campaign visible", () => {
    expect(filterCampaigns(campaigns, "spring").map((item) => item.id)).toEqual([2])
    expect(filterCampaigns(campaigns, "spring", 1).map((item) => item.id)).toEqual([1, 2])
  })
})

describe("filterSendLogs", () => {
  const logs = [
    { status: "sent", contactEmail: "ok@example.com", contactName: "Ok", error: "" },
    { status: "failed", contactEmail: "bad@example.com", contactName: "Bad", error: "550 mailbox" },
  ]

  it("filters by status and searches email, name, and error", () => {
    expect(filterSendLogs(logs, "failed", "").map((item) => item.contactEmail)).toEqual(["bad@example.com"])
    expect(filterSendLogs(logs, "all", "550").map((item) => item.contactEmail)).toEqual(["bad@example.com"])
  })
})

describe("filterContacts", () => {
  const contacts = [
    { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", unsubscribed: false },
    { email: "al@example.com", firstName: "Al", lastName: "Turing", unsubscribed: true },
  ]

  it("filters by subscription and search fields", () => {
    expect(filterContacts(contacts, "", "subscribed").map((item) => item.email)).toEqual(["ada@example.com"])
    expect(filterContacts(contacts, "turing", "all").map((item) => item.email)).toEqual(["al@example.com"])
  })
})

describe("isSendReady", () => {
  const ready = {
    senderReady: true,
    smtpReady: true,
    listsReady: true,
    hasRecipients: true,
    subjectReady: true,
  }

  it("requires every checklist flag", () => {
    expect(isSendReady(ready)).toBe(true)
    expect(isSendReady({ ...ready, hasRecipients: false })).toBe(false)
  })
})

describe("campaign draft persistence", () => {
  const draft = {
    name: "Welcome",
    subject: "Hello",
    senderId: 1,
    listIds: [2, 3],
    htmlContent: "[]",
  }

  it("treats matching snapshots as clean and name/subject as required", () => {
    expect(isCampaignDraftDirty(draft, campaignDraftSnapshot(draft))).toBe(false)
    expect(isCampaignDraftDirty({ ...draft, subject: "Changed" }, campaignDraftSnapshot(draft))).toBe(true)
    expect(canPersistCampaignDraft({ name: "  ", subject: "Hello" })).toBe(false)
    expect(canPersistCampaignDraft(draft)).toBe(true)
  })

  it("saves valid dirty drafts on leave and asks to confirm incomplete ones", () => {
    expect(campaignLeaveAction(false, true)).toBe("close")
    expect(campaignLeaveAction(true, true)).toBe("save")
    expect(campaignLeaveAction(true, false)).toBe("confirm")
  })
})
