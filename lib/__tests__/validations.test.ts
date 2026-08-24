import { describe, it, expect } from "vitest"
import { MAX_CAMPAIGN_ATTACHMENTS } from "@/lib/attachments"
import { SIGNATURE_MAX_CHARS, smtpTestSchema, smtpSendSchema, smtpSendBatchSchema } from "@/lib/validations"

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

  it("accepts optional base64 attachments", () => {
    const result = smtpSendSchema.safeParse({
      ...valid,
      attachments: [
        {
          filename: "brief.pdf",
          content: "JVBERi0=",
          encoding: "base64",
          contentType: "application/pdf",
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("does not count CID images toward the file attachment cap", () => {
    const images = Array.from({ length: MAX_CAMPAIGN_ATTACHMENTS }, (_, index) => ({
      filename: `image-${index}.png`,
      content: "abc",
      encoding: "base64" as const,
      contentType: "image/png",
      cid: `img-${index}`,
    }))
    const result = smtpSendSchema.safeParse({
      ...valid,
      attachments: [
        ...images,
        {
          filename: "brief.pdf",
          content: "JVBERi0=",
          encoding: "base64",
          contentType: "application/pdf",
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects more file attachments than the campaign limit", () => {
    const files = Array.from({ length: MAX_CAMPAIGN_ATTACHMENTS + 1 }, (_, index) => ({
      filename: `file-${index}.txt`,
      content: "YQ==",
      encoding: "base64" as const,
      contentType: "text/plain",
    }))
    expect(smtpSendSchema.safeParse({ ...valid, attachments: files }).success).toBe(false)
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

  it("accepts HTML signatures larger than 10,000 characters", () => {
    expect(smtpSendBatchSchema.safeParse({ ...valid, signature: "x".repeat(12_000) }).success).toBe(true)
  })

  it("rejects signatures above the HTML size cap", () => {
    expect(
      smtpSendBatchSchema.safeParse({ ...valid, signature: "x".repeat(SIGNATURE_MAX_CHARS + 1) }).success,
    ).toBe(false)
  })

  it("accepts attachment blocks with large base64 content", () => {
    const result = smtpSendBatchSchema.safeParse({
      ...valid,
      blocks: [
        {
          id: "a1",
          type: "attachment" as const,
          content: `data:application/pdf;base64,${"A".repeat(60_000)}`,
          props: { filename: "brief.pdf", mimeType: "application/pdf", size: "45000" },
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})
