import { describe, it, expect } from "vitest"
import { smtpTestSchema, smtpSendSchema, smtpSendBatchSchema } from "@/lib/validations"

describe("smtpTestSchema", () => {
  const valid = { host: "smtp.example.com", port: 587, secure: false, username: "user", password: "pass" }

  it("accepts valid SMTP config", () => {
    expect(smtpTestSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects empty host", () => {
    expect(smtpTestSchema.safeParse({ ...valid, host: "" }).success).toBe(false)
  })

  it("rejects port 0", () => {
    expect(smtpTestSchema.safeParse({ ...valid, port: 0 }).success).toBe(false)
  })

  it("rejects port above 65535", () => {
    expect(smtpTestSchema.safeParse({ ...valid, port: 70000 }).success).toBe(false)
  })

  it("coerces port from string", () => {
    const result = smtpTestSchema.safeParse({ ...valid, port: "465" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.port).toBe(465)
  })

  it("allows empty password", () => {
    expect(smtpTestSchema.safeParse({ ...valid, password: "" }).success).toBe(true)
  })
})

describe("smtpSendSchema", () => {
  const valid = {
    smtp: { host: "smtp.example.com", port: 587, secure: true, auth: { user: "u", pass: "p" } },
    from: { name: "Newsletter", email: "news@example.com" },
    to: "recipient@example.com",
    subject: "Test",
    html: "<p>Hello</p>",
  }

  it("accepts a valid send request", () => {
    expect(smtpSendSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects invalid recipient email", () => {
    expect(smtpSendSchema.safeParse({ ...valid, to: "not-an-email" }).success).toBe(false)
  })

  it("rejects invalid sender email", () => {
    const data = { ...valid, from: { name: "Test", email: "bad" } }
    expect(smtpSendSchema.safeParse(data).success).toBe(false)
  })

  it("rejects empty subject", () => {
    expect(smtpSendSchema.safeParse({ ...valid, subject: "" }).success).toBe(false)
  })

  it("rejects subject longer than 998 chars", () => {
    expect(smtpSendSchema.safeParse({ ...valid, subject: "x".repeat(999) }).success).toBe(false)
  })

  it("accepts empty replyTo", () => {
    expect(smtpSendSchema.safeParse({ ...valid, replyTo: "" }).success).toBe(true)
  })

  it("accepts valid replyTo email", () => {
    expect(smtpSendSchema.safeParse({ ...valid, replyTo: "reply@example.com" }).success).toBe(true)
  })

  it("rejects invalid replyTo", () => {
    expect(smtpSendSchema.safeParse({ ...valid, replyTo: "bad" }).success).toBe(false)
  })
})

describe("smtpSendBatchSchema", () => {
  const valid = {
    smtp: { host: "smtp.example.com", port: 587, secure: true, auth: { user: "u", pass: "p" } },
    from: { name: "Newsletter", email: "news@example.com" },
    subjectTemplate: "Hello {{firstName}}",
    blocks: [{ id: "1", type: "text" as const, content: "<p>Hi</p>", props: {} }],
    signature: "",
    unsubscribeEmail: "unsub@example.com",
    contacts: [{ email: "a@example.com", firstName: "Alice", lastName: "Smith" }],
  }

  it("accepts a valid batch request", () => {
    expect(smtpSendBatchSchema.safeParse(valid).success).toBe(true)
  })

  it("applies default delayMs of 0", () => {
    const result = smtpSendBatchSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.delayMs).toBe(0)
  })

  it("applies default maxRetries of 2", () => {
    const result = smtpSendBatchSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.maxRetries).toBe(2)
  })

  it("rejects empty contacts array", () => {
    expect(smtpSendBatchSchema.safeParse({ ...valid, contacts: [] }).success).toBe(false)
  })

  it("rejects more than 500 contacts", () => {
    const contacts = Array.from({ length: 501 }, (_, i) => ({
      email: `user${i}@example.com`,
      firstName: "User",
      lastName: `${i}`,
    }))
    expect(smtpSendBatchSchema.safeParse({ ...valid, contacts }).success).toBe(false)
  })

  it("accepts contacts with customData", () => {
    const data = { ...valid, contacts: [{ email: "a@example.com", firstName: "A", lastName: "B", customData: { company: "Acme" } }] }
    const result = smtpSendBatchSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("rejects empty blocks array", () => {
    expect(smtpSendBatchSchema.safeParse({ ...valid, blocks: [] }).success).toBe(false)
  })

  it("rejects empty subjectTemplate", () => {
    expect(smtpSendBatchSchema.safeParse({ ...valid, subjectTemplate: "" }).success).toBe(false)
  })

  it("rejects delayMs above 10000", () => {
    expect(smtpSendBatchSchema.safeParse({ ...valid, delayMs: 20000 }).success).toBe(false)
  })

  it("rejects maxRetries above 5", () => {
    expect(smtpSendBatchSchema.safeParse({ ...valid, maxRetries: 10 }).success).toBe(false)
  })
})
