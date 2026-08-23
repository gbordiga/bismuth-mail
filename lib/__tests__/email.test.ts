import { describe, expect, it } from "vitest"
import { isValidEmail, normalizeEmail } from "@/lib/email"

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com")
  })
})

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("ada@example.com")).toBe(true)
  })

  it("rejects empty or malformed values", () => {
    expect(isValidEmail("")).toBe(false)
    expect(isValidEmail("not-an-email")).toBe(false)
  })
})
