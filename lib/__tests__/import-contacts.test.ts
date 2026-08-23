import { describe, expect, it } from "vitest"
import { parseUnsubscribedFlag, planContactImport } from "@/lib/import-contacts"

describe("parseUnsubscribedFlag", () => {
  it("accepts common truthy values", () => {
    expect(parseUnsubscribedFlag("yes")).toBe(true)
    expect(parseUnsubscribedFlag("TRUE")).toBe(true)
    expect(parseUnsubscribedFlag("1")).toBe(true)
    expect(parseUnsubscribedFlag("unsubscribed")).toBe(true)
    expect(parseUnsubscribedFlag("no")).toBe(false)
    expect(parseUnsubscribedFlag(undefined)).toBe(false)
  })
})

describe("planContactImport", () => {
  it("skips invalid, duplicate, existing, and suppressed emails", () => {
    const plan = planContactImport({
      dataRows: [
        ["Ada@Example.com", "Ada", "Lovelace", "no"],
        ["not-an-email", "X", "Y", "no"],
        ["ada@example.com", "Dup", "InFile", "no"],
        ["existing@example.com", "Old", "One", "no"],
        ["banned@example.com", "Ban", "Ned", "no"],
        ["optout@example.com", "Opt", "Out", "yes"],
      ],
      mapping: { email: 0, firstName: 1, lastName: 2, unsubscribed: 3, custom: {} },
      existingEmails: ["Existing@example.com"],
      suppressedEmails: ["Banned@example.com"],
    })

    expect(plan.invalid).toBe(1)
    expect(plan.duplicatesInFile).toBe(1)
    expect(plan.alreadyInList).toBe(1)
    expect(plan.suppressedSkipped).toBe(1)
    expect(plan.toAdd).toEqual([
      {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        customData: {},
        unsubscribed: false,
      },
      {
        email: "optout@example.com",
        firstName: "Opt",
        lastName: "Out",
        customData: {},
        unsubscribed: true,
      },
    ])
  })
})
